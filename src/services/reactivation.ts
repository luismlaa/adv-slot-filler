import { allocate } from "@/domain/allocation";
import { firstNameOf, formatWhen, reactivationMessage } from "@/domain/conversation";
import { type ClientCycle, selectNudges } from "@/domain/cycles";
import type { Client, Nudge } from "@/domain/model";
import type { BusinessConfig } from "@/config/business";
import type { CopyContext } from "@/domain/conversation";
import type { ScheduleSnapshot } from "@/domain/time";
import { localParts, toIso } from "@/domain/time";
import { recordActivity } from "./activity";
import type { AppContext } from "./context";
import { copyContext, loadCycles, loadSnapshot, publish } from "./data";
import { TEMPLATES, sendToClient } from "./notify";

export interface ReactivationRun {
  readonly sent: number;
  readonly skipped: number;
  readonly names: readonly string[];
}

/**
 * "Ya te toca": invita a cada cliente cuyo ciclo real llegó, proponiéndole un espacio concreto
 * con su estilista habitual. Idempotente: un cliente recibe como máximo una invitación por ciclo
 * (más un recordatorio si la ignoró).
 */
export async function runReactivation(ctx: AppContext, options: { force?: boolean } = {}): Promise<ReactivationRun> {
  const config = await ctx.config();
  const now = ctx.clock.now();
  const salon = await ctx.store.salon.get();
  const local = localParts(now, salon.timezone);
  if (config.reactivation.mode === "off") return { sent: 0, skipped: 0, names: [] };
  if (!options.force && local.minutesOfDay < config.reactivation.sendHourLocal * 60) return { sent: 0, skipped: 0, names: [] };

  const [cycles, clients, nudges, snapshot, copy] = await Promise.all([
    loadCycles(ctx),
    ctx.store.clients.list(),
    ctx.store.nudges.list(),
    loadSnapshot(ctx),
    copyContext(ctx),
  ]);
  const selected = selectNudges({
    cycles,
    clients,
    nudges,
    today: local.date,
    timezone: salon.timezone,
    leadDays: config.reactivation.leadDays,
    renudgeAfterDays: config.reactivation.renudgeAfterDays,
    maxPerRun: config.reactivation.maxPerRun,
  });

  const names: string[] = [];
  let skipped = 0;
  for (const cycle of selected) {
    const client = clients.find((c) => c.id === cycle.clientId);
    if (!client) continue;
    const sent = await sendNudge(ctx, { cycle, client, snapshot, copy, config, now, today: local.date });
    if (sent) names.push(firstNameOf(client.name));
    else skipped += 1;
  }

  if (names.length > 0) {
    const preview = names.slice(0, 5).join(", ") + (names.length > 5 ? ` y ${names.length - 5} más` : "");
    await recordActivity(ctx, "reactivation.run", `Invitaciones de regreso enviadas a ${names.length} clientes según su ciclo: ${preview}.`, {}, "success");
  }
  return { sent: names.length, skipped, names };
}

interface NudgeInput {
  readonly cycle: ClientCycle;
  readonly client: Client;
  readonly snapshot: ScheduleSnapshot;
  readonly copy: CopyContext;
  readonly config: BusinessConfig;
  readonly now: number;
  readonly today: string;
}

/** Envía una invitación de ciclo con un espacio concreto propuesto y deja la conversación esperando respuesta. */
async function sendNudge(ctx: AppContext, input: NudgeInput): Promise<Nudge | undefined> {
  const { cycle, client, snapshot, copy, config, now, today } = input;
  const proposal = allocate(
    { serviceId: cycle.usualServiceId, staffId: cycle.usualStaffId, date: cycle.dueDate > today ? cycle.dueDate : today },
    { snapshot, now, config },
  );
  const slotOptions = [...proposal.matches, ...proposal.alternatives].slice(0, config.reactivation.slotsToOffer);
  const text = reactivationMessage(copy, client.name, cycle.daysSinceLast, cycle.usualStaffId, cycle.usualServiceId, slotOptions);
  const staffName = firstNameOf(copy.staff.find((s) => s.id === cycle.usualStaffId)?.name ?? "");
  const outcome = await sendToClient(ctx, client, text, "reactivation", {
    name: TEMPLATES.reactivation,
    language: "es",
    params: [
      firstNameOf(client.name),
      String(Math.round(cycle.daysSinceLast / 7)),
      staffName,
      slotOptions[0] ? formatWhen(slotOptions[0].start, copy.timezone, copy.today) : "esta semana",
    ],
  });
  if (!outcome.sent) return undefined;
  const nudge: Nudge = {
    id: ctx.ids.newId(),
    salonId: ctx.store.salonId,
    clientId: client.id,
    category: cycle.category,
    serviceId: cycle.usualServiceId,
    dueDate: cycle.dueDate,
    lastVisitAppointmentId: cycle.lastVisitAppointmentId,
    status: "sent",
    sentAt: toIso(now),
  };
  await ctx.store.nudges.insert(nudge);
  if (slotOptions.length > 0) {
    await ctx.store.conversations.save({
      salonId: ctx.store.salonId,
      phone: client.phone,
      state: { step: "choosing", purpose: "reactivation", options: slotOptions, request: { serviceId: cycle.usualServiceId, staffId: cycle.usualStaffId }, nudgeId: nudge.id },
      updatedAt: toIso(now),
    });
  }
  publish(ctx, "nudge.sent", { nudgeId: nudge.id, clientId: client.id });
  return nudge;
}

export type InviteResult = { readonly ok: true; readonly nudge: Nudge } | { readonly ok: false; readonly reason: "no_cycle" | "opted_out" | "not_sent" };

/** Botón "Invitar ahora" del panel: invita a un cliente concreto aunque no sea su hora de envío. */
export async function inviteClient(ctx: AppContext, clientId: string, category?: string): Promise<InviteResult> {
  const [config, salon, cycles, client, snapshot, copy] = await Promise.all([
    ctx.config(),
    ctx.store.salon.get(),
    loadCycles(ctx),
    ctx.store.clients.get(clientId),
    loadSnapshot(ctx),
    copyContext(ctx),
  ]);
  const cycle = cycles.find((c) => c.clientId === clientId && (category === undefined || c.category === category));
  if (!client || !cycle) return { ok: false, reason: "no_cycle" };
  if (client.optedOut) return { ok: false, reason: "opted_out" };
  const now = ctx.clock.now();
  const nudge = await sendNudge(ctx, { cycle, client, snapshot, copy, config, now, today: localParts(now, salon.timezone).date });
  if (!nudge) return { ok: false, reason: "not_sent" };
  await recordActivity(ctx, "reactivation.manual", `El salón invitó a ${client.name} a volver (le tocaba hace ${Math.max(0, -cycle.daysUntilDue)} días).`, { clientId }, "success");
  return { ok: true, nudge };
}
