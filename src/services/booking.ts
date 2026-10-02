import type { Appointment, AppointmentSource, Id } from "@/domain/model";
import { MINUTE, fromIso, isSlotFree, localDateOf, toIso } from "@/domain/time";
import { formatWhen, firstNameOf } from "@/domain/conversation";
import { recordActivity } from "./activity";
import type { AppContext } from "./context";
import { loadSnapshot, publish } from "./data";

export interface BookInput {
  readonly clientId: Id;
  readonly staffId: Id;
  readonly serviceId: Id;
  readonly start: string;
  readonly source: AppointmentSource;
  readonly gapId?: Id;
}

export type BookResult =
  | { readonly ok: true; readonly appointment: Appointment }
  | { readonly ok: false; readonly reason: "unknown_service" | "unknown_staff" | "unavailable" | "in_past" };

/**
 * Reserva una cita. Valida contra horario y bloqueos, y la inserción es un compare-and-set:
 * si dos clientes piden el mismo espacio a la vez, solo uno lo obtiene.
 */
export async function bookAppointment(ctx: AppContext, input: BookInput): Promise<BookResult> {
  const snapshot = await loadSnapshot(ctx);
  const service = snapshot.services.find((s) => s.id === input.serviceId);
  if (!service) return { ok: false, reason: "unknown_service" };
  const staff = snapshot.staff.find((s) => s.id === input.staffId);
  if (!staff) return { ok: false, reason: "unknown_staff" };
  const start = fromIso(input.start);
  if (start < ctx.clock.now()) return { ok: false, reason: "in_past" };
  const end = start + service.durationMinutes * MINUTE;
  const occupied = { start, end: end + service.bufferMinutes * MINUTE };
  if (!isSlotFree(staff, occupied, snapshot)) return { ok: false, reason: "unavailable" };

  const appointment: Appointment = {
    id: ctx.ids.newId(),
    salonId: ctx.store.salonId,
    clientId: input.clientId,
    staffId: staff.id,
    serviceId: service.id,
    start: toIso(start),
    end: toIso(end),
    status: "booked",
    source: input.source,
    price: service.price,
    createdAt: toIso(ctx.clock.now()),
    gapId: input.gapId,
  };
  const inserted = await ctx.store.appointments.insertIfFree(appointment);
  if (!inserted.ok) return { ok: false, reason: "unavailable" };

  const client = await ctx.store.clients.get(input.clientId);
  publish(ctx, "appointment.booked", { appointmentId: appointment.id, staffId: staff.id, source: input.source });
  await recordActivity(
    ctx,
    "appointment.booked",
    `${firstNameOf(client?.name ?? "Cliente")} reservó ${service.name.toLowerCase()} con ${firstNameOf(staff.name)} ${formatWhen(appointment.start, snapshot.timezone, localDateOf(ctx.clock.now(), snapshot.timezone))} (${SOURCE_LABEL[input.source]})`,
    { clientId: input.clientId, staffId: staff.id, appointmentId: appointment.id, gapId: input.gapId },
    input.source === "gapfill" || input.source === "reactivation" ? "success" : "info",
  );
  await ctx.calendar?.appointmentChanged(appointment);
  return { ok: true, appointment };
}

const SOURCE_LABEL: Record<AppointmentSource, string> = {
  whatsapp: "por WhatsApp",
  salon: "desde el salón",
  gapfill: "rellenando un hueco",
  reactivation: "por invitación de ciclo",
  walkin: "sin cita",
  import: "importada",
};

/** Cancela una cita vigente. Devuelve la cita cancelada (o `undefined` si ya no estaba reservada). */
export async function cancelAppointment(ctx: AppContext, appointmentId: Id, reason: string): Promise<Appointment | undefined> {
  const cancelled = await ctx.store.appointments.transition(appointmentId, ["booked"], {
    status: "cancelled",
    cancelledAt: toIso(ctx.clock.now()),
    cancelReason: reason,
  });
  if (!cancelled) return undefined;
  const [client, staff, salon] = await Promise.all([
    ctx.store.clients.get(cancelled.clientId),
    ctx.store.staff.list().then((list) => list.find((s) => s.id === cancelled.staffId)),
    ctx.store.salon.get(),
  ]);
  publish(ctx, "appointment.cancelled", { appointmentId, staffId: cancelled.staffId });
  await recordActivity(
    ctx,
    "appointment.cancelled",
    `${firstNameOf(client?.name ?? "Cliente")} canceló su cita con ${firstNameOf(staff?.name ?? "")} ${formatWhen(cancelled.start, salon.timezone, localDateOf(ctx.clock.now(), salon.timezone))} — ${reason}`,
    { clientId: cancelled.clientId, staffId: cancelled.staffId, appointmentId },
    "warning",
  );
  await ctx.calendar?.appointmentChanged(cancelled);
  return cancelled;
}

/** Las citas que ya terminaron pasan a "completada" (alimentan el ciclo de cada cliente). */
export async function completePastAppointments(ctx: AppContext): Promise<number> {
  const now = ctx.clock.now();
  const past = await ctx.store.appointments.list({ to: toIso(now), statuses: ["booked"] });
  let completed = 0;
  for (const appointment of past.filter((a) => fromIso(a.end) <= now)) {
    if (await ctx.store.appointments.transition(appointment.id, ["booked"], { status: "completed" })) completed += 1;
  }
  if (completed > 0) publish(ctx, "appointment.updated", { completed });
  return completed;
}

/** Próxima cita vigente de un cliente. */
export async function nextAppointmentOf(ctx: AppContext, clientId: Id): Promise<Appointment | undefined> {
  const upcoming = await ctx.store.appointments.list({ clientId, from: toIso(ctx.clock.now()), statuses: ["booked"] });
  return upcoming.sort((a, b) => a.start.localeCompare(b.start))[0];
}
