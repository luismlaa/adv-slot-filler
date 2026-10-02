import { allocate } from "@/domain/allocation";
import { firstNameOf, formatWhen, reactivationMessage } from "@/domain/conversation";
import { selectNudges } from "@/domain/cycles";
import type { Nudge } from "@/domain/model";
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
    const proposal = allocate(
      { serviceId: cycle.usualServiceId, staffId: cycle.usualStaffId, date: cycle.dueDate > local.date ? cycle.dueDate : local.date },
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
    if (!outcome.sent) {
      skipped += 1;
      continue;
    }
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
    names.push(firstNameOf(client.name));
  }

  if (names.length > 0) {
    const preview = names.slice(0, 5).join(", ") + (names.length > 5 ? ` y ${names.length - 5} más` : "");
    await recordActivity(ctx, "reactivation.run", `Invitaciones de regreso enviadas a ${names.length} clientes según su ciclo: ${preview}.`, {}, "success");
  }
  return { sent: names.length, skipped, names };
}
