import { planCalendarChanges } from "@/domain/calendar/reconcile";
import { firstNameOf, formatWhen } from "@/domain/conversation";
import type { Appointment, Block, CalendarLink, Id } from "@/domain/model";
import { DAY, localDateOf, toIso } from "@/domain/time";
import type { CalendarProvider } from "@/ports";
import { recordActivity } from "./activity";
import type { AppContext, CalendarHooks } from "./context";
import { publish } from "./data";

type BaseContext = Omit<AppContext, "calendar">;

/**
 * Sync bidireccional con el calendario de cada estilista:
 * - Slot Filler → calendario: cada cita reservada/cancelada se refleja como evento.
 * - Calendario → Slot Filler: los eventos personales bloquean la agenda; los cambios a nuestras
 *   citas hechos en el calendario se avisan como conflicto (nunca se sobrescriben en silencio).
 * Un fallo del calendario nunca rompe una reserva: se registra y el enlace queda en "error".
 */
export function createCalendarSync(ctx: BaseContext, provider: CalendarProvider, webhookUrl?: string) {
  const markError = async (link: CalendarLink, error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    await ctx.store.calendarLinks.upsert({ ...link, status: "error", lastError: message });
    ctx.logger.error("Sync de calendario falló", { salonId: ctx.store.salonId, staffId: link.staffId, error: message });
  };

  const hooks: CalendarHooks = {
    async appointmentChanged(appointment: Appointment) {
      const link = await ctx.store.calendarLinks.get(appointment.staffId);
      if (!link || link.status === "disconnected") return;
      try {
        if (appointment.status === "booked") {
          const [client, services] = await Promise.all([ctx.store.clients.get(appointment.clientId), ctx.store.services.list()]);
          const service = services.find((s) => s.id === appointment.serviceId);
          const event = await provider.upsertEvent(
            link.calendarId,
            appointment.externalEventId,
            {
              title: `✂️ ${service?.name ?? "Cita"} — ${firstNameOf(client?.name ?? "Cliente")}`,
              description: `Reservada por Slot Filler. Tel: ${client?.phone ?? ""}`,
              start: appointment.start,
              end: appointment.end,
              slotFillerId: appointment.id,
            },
            link.refreshToken,
          );
          if (event.id !== appointment.externalEventId) await ctx.store.appointments.update(appointment.id, { externalEventId: event.id });
        } else if (appointment.externalEventId && (appointment.status === "cancelled" || appointment.status === "no_show")) {
          await provider.deleteEvent(link.calendarId, appointment.externalEventId, link.refreshToken);
        }
      } catch (error) {
        await markError(link, error);
      }
    },
  };

  /** Trae los cambios del calendario de un estilista y los aplica a la agenda. Idempotente. */
  async function syncStaff(staffId: Id): Promise<{ blocks: number; conflicts: number }> {
    const link = await ctx.store.calendarLinks.get(staffId);
    if (!link || link.status === "disconnected") return { blocks: 0, conflicts: 0 };
    try {
      let changes = await provider.listChanges(link.calendarId, link.syncToken, link.refreshToken);
      if (changes.fullResyncRequired) changes = await provider.listChanges(link.calendarId, undefined, link.refreshToken);
      const now = ctx.clock.now();
      const [appointments, blocks, staff, salon] = await Promise.all([
        ctx.store.appointments.list({ staffId, from: toIso(now - DAY), statuses: ["booked"] }),
        ctx.store.blocks.list({ staffId }),
        ctx.store.staff.list(),
        ctx.store.salon.get(),
      ]);
      const plan = planCalendarChanges(staffId, changes.events, appointments, blocks);
      for (const draft of plan.upsertBlocks) {
        const existing = blocks.find((b) => b.externalEventId === draft.externalEventId);
        const block: Block = { ...draft, id: existing?.id ?? ctx.ids.newId(), salonId: ctx.store.salonId, createdAt: existing?.createdAt ?? toIso(now) };
        await ctx.store.blocks.upsert(block);
      }
      for (const id of plan.deleteBlockIds) await ctx.store.blocks.delete(id);

      const name = firstNameOf(staff.find((s) => s.id === staffId)?.name ?? "");
      const today = localDateOf(now, salon.timezone);
      for (const conflict of plan.conflicts) {
        const appointment = "appointmentId" in conflict ? appointments.find((a) => a.id === conflict.appointmentId) : undefined;
        const when = appointment ? formatWhen(appointment.start, salon.timezone, today) : "";
        const message =
          conflict.kind === "our_event_deleted"
            ? `${name} borró en su Google Calendar la cita de ${when}. Sigue vigente en Slot Filler: confirma con el cliente antes de cancelar.`
            : conflict.kind === "our_event_moved"
              ? `${name} movió en su Google Calendar la cita de ${when}. La agenda no se cambió sola: muévela desde Slot Filler si corresponde.`
              : `${name} agregó «${conflict.title}» en su calendario y choca con ${conflict.appointmentIds.length} cita(s). Hay que reubicarlas.`;
        await recordActivity(ctx, "calendar.conflict", message, { staffId, appointmentId: "appointmentId" in conflict ? conflict.appointmentId : undefined }, "warning");
      }
      if (plan.upsertBlocks.length > 0 || plan.deleteBlockIds.length > 0) {
        publish(ctx, "block.changed", { staffId });
        const added = plan.upsertBlocks.map((b) => `«${b.title}»`).join(", ");
        if (added) await recordActivity(ctx, "calendar.blocked", `${name} tiene ${added} en su Google Calendar: ese tiempo quedó bloqueado en la agenda.`, { staffId });
      }
      await ctx.store.calendarLinks.upsert({ ...link, status: "connected", syncToken: changes.nextSyncToken, lastSyncAt: toIso(now), lastError: undefined });
      publish(ctx, "calendar.synced", { staffId });
      return { blocks: plan.upsertBlocks.length, conflicts: plan.conflicts.length };
    } catch (error) {
      await markError(link, error);
      return { blocks: 0, conflicts: 0 };
    }
  }

  /** Conecta el calendario de un estilista: guarda el enlace, abre el canal de push y hace el primer sync. */
  async function connect(staffId: Id, calendarId: string, refreshToken?: string): Promise<CalendarLink> {
    const now = toIso(ctx.clock.now());
    let link: CalendarLink = { salonId: ctx.store.salonId, staffId, provider: provider.name, calendarId, status: "connected", refreshToken, connectedAt: now };
    if (webhookUrl) {
      const channel = await provider.watch(calendarId, webhookUrl, refreshToken);
      link = { ...link, channelId: channel.channelId, channelResourceId: channel.resourceId, channelExpiresAt: channel.expiresAt };
    }
    await ctx.store.calendarLinks.upsert(link);
    await syncStaff(staffId);
    return (await ctx.store.calendarLinks.get(staffId)) ?? link;
  }

  /** Webhook de Google: identifica al estilista por el canal y sincroniza. */
  async function handlePush(channelId: string): Promise<boolean> {
    const link = (await ctx.store.calendarLinks.list()).find((l) => l.channelId === channelId);
    if (!link) return false;
    await syncStaff(link.staffId);
    return true;
  }

  async function syncAll(): Promise<void> {
    for (const link of await ctx.store.calendarLinks.list()) await syncStaff(link.staffId);
  }

  return { hooks, syncStaff, connect, handlePush, syncAll };
}

export type CalendarSync = ReturnType<typeof createCalendarSync>;
