import type { FakeCalendarProvider } from "@/adapters/calendar/fake";
import { PERSONAS } from "@/adapters/memory/seed";
import { createRng } from "@/adapters/memory/seed/rng";
import { staffCanPerform } from "@/domain/model";
import { DAY, MINUTE, addDaysToDate, candidateStarts, localDateOf, toIso, utilization, zonedInstant } from "@/domain/time";
import type { CalendarSync } from "./calendar-sync";
import type { AppContext } from "./context";
import { handleInbound } from "./conversation";
import { loadCycles, publish } from "./data";
import { type TickReport, tick } from "./jobs";

export interface DemoDeps {
  readonly ctx: AppContext;
  readonly clock: { advance(ms: number): number; set(instant: number): number };
  readonly calendar?: FakeCalendarProvider;
  readonly calendarSync: CalendarSync;
  readonly calendarId: string;
  readonly calendarStaffId: string;
}

let inboundSeq = 0;

/** Mensaje entrante simulado (como si llegara por el webhook de WhatsApp). */
export async function simulateInbound(ctx: AppContext, phone: string, text: string, profileName?: string) {
  inboundSeq += 1;
  return handleInbound(ctx, { from: phone, text, providerMessageId: `sim-in-${Date.now()}-${inboundSeq}`, profileName, at: toIso(ctx.clock.now()) });
}

const personaIds = new Set<string>(Object.values(PERSONAS).map((p) => p.id));

/**
 * Solo demo: al saltar semanas, el resto del negocio "siguió funcionando". Llena los días del
 * periodo saltado (como citas atendidas) y la semana siguiente (como reservas) hasta una ocupación
 * típica, y etiqueta una parte como huecos rellenados / regresos por ciclo para que el ROI del
 * periodo sea coherente. No genera mensajes ni actividad. Determinista por fecha.
 */
async function simulateBusiness(ctx: AppContext, fromDate: string, toDate: string): Promise<void> {
  const [clients, salon, config, staffList, services] = await Promise.all([
    ctx.store.clients.list(),
    ctx.store.salon.get(),
    ctx.config(),
    ctx.store.staff.list(),
    ctx.store.services.list(),
  ]);
  const regulars = clients.filter((c) => !personaIds.has(c.id));
  const now = ctx.clock.now();
  const today = localDateOf(now, salon.timezone);
  for (let date = fromDate; date <= toDate; date = addDaysToDate(date, 1)) {
    const rng = createRng(Number(date.replaceAll("-", "")));
    const dayStart = zonedInstant(date, "00:00", salon.timezone);
    const existing = await ctx.store.appointments.list({ from: toIso(dayStart), to: toIso(dayStart + DAY), statuses: ["booked", "completed"] });
    const blocks = await ctx.store.blocks.list({ from: toIso(dayStart), to: toIso(dayStart + DAY) });
    let appointments = [...existing];
    const past = date < today;
    const target = 0.6 + rng.next() * 0.2 - (date === today ? 0.15 : 0);
    for (const staff of staffList.filter((st) => st.active)) {
      const eligible = services.filter((sv) => sv.active && staffCanPerform(staff, sv));
      for (let guard = 0; guard < 30 && eligible.length > 0; guard += 1) {
        const snapshot = { timezone: salon.timezone, staff: staffList, services, appointments, blocks };
        if (utilization(staff, date, snapshot) >= target) break;
        const service = rng.pick(eligible);
        const starts = candidateStarts(staff, service, date, snapshot, past ? dayStart : now, config.slots);
        if (starts.length === 0) break;
        const start = rng.pick(starts);
        if (!past && start < now) continue;
        const client = rng.pick(regulars);
        const roll = rng.next();
        const source = past && roll < 0.05 ? "gapfill" : past && roll < 0.13 ? "reactivation" : rng.chance(0.7) ? "whatsapp" : "salon";
        const id = ctx.ids.newId();
        const startIso = toIso(start);
        const endIso = toIso(start + service.durationMinutes * MINUTE);
        let gapId: string | undefined;
        if (source === "gapfill") {
          gapId = ctx.ids.newId();
          const originId = ctx.ids.newId();
          const cancelledAt = start - rng.int(3, 30) * 3_600_000;
          await ctx.store.appointments.insertIfFree({
            id: originId, salonId: ctx.store.salonId, clientId: rng.pick(regulars).id, staffId: staff.id, serviceId: service.id,
            start: startIso, end: endIso, status: "booked", source: "whatsapp", price: service.price, createdAt: toIso(cancelledAt - 5 * DAY),
          });
          await ctx.store.appointments.transition(originId, ["booked"], { status: "cancelled", cancelledAt: toIso(cancelledAt) });
          await ctx.store.gaps.insert({
            id: gapId, salonId: ctx.store.salonId, staffId: staff.id, start: startIso, end: endIso, originAppointmentId: originId,
            status: "filled", wave: 1, createdAt: toIso(cancelledAt), filledAt: toIso(cancelledAt + rng.int(4, 40) * MINUTE), filledByAppointmentId: id,
          });
        }
        const result = await ctx.store.appointments.insertIfFree({
          id, salonId: ctx.store.salonId, clientId: client.id, staffId: staff.id, serviceId: service.id, start: startIso, end: endIso,
          status: past ? "completed" : "booked", source, price: service.price, gapId, createdAt: toIso(Math.min(start, now) - rng.int(1, 9) * DAY),
        });
        if (!result.ok) continue;
        appointments = [...appointments, result.value];
        if (source === "reactivation") {
          await ctx.store.nudges.insert({
            id: ctx.ids.newId(), salonId: ctx.store.salonId, clientId: client.id, category: service.category, serviceId: service.id,
            dueDate: date, lastVisitAppointmentId: `organic-${id}`, status: "booked", sentAt: toIso(start - rng.int(1, 3) * DAY), bookedAppointmentId: id,
          });
        }
      }
    }
  }
}

/** Avanza el reloj simulado y corre el trabajo periódico, como pasaría en producción. */
export async function advanceClock(deps: DemoDeps, ms: number): Promise<TickReport> {
  const salon = await deps.ctx.store.salon.get();
  const before = localDateOf(deps.ctx.clock.now(), salon.timezone);
  deps.clock.advance(ms);
  if (ms >= DAY) {
    const after = localDateOf(deps.ctx.clock.now(), salon.timezone);
    await simulateBusiness(deps.ctx, addDaysToDate(before, 1), addDaysToDate(after, 6));
  }
  publish(deps.ctx, "clock.changed", { advancedMs: ms });
  const report = await tick(deps.ctx);
  await deps.calendarSync.syncAll();
  return report;
}

/**
 * Avanza el reloj hasta la mañana (10:05) del día en que a un cliente le toca volver según su
 * ciclo real: así el presentador muestra la invitación «ya te toca» sin calcular fechas a mano.
 */
export async function advanceToClientCycle(deps: DemoDeps, clientId: string): Promise<{ date: string; tick: TickReport }> {
  const { ctx } = deps;
  const salon = await ctx.store.salon.get();
  const visits = await ctx.store.appointments.list({ clientId, statuses: ["booked", "completed"] });
  const last = visits.sort((a, b) => b.start.localeCompare(a.start))[0];
  const lastDate = last ? localDateOf(Date.parse(last.start), salon.timezone) : localDateOf(ctx.clock.now(), salon.timezone);
  const cycle = (await loadCycles(ctx)).find((c) => c.clientId === clientId);
  const expected = cycle ? Math.round(cycle.expectedDays) : 28;
  const config = await ctx.config();
  const target = zonedInstant(addDaysToDate(lastDate, Math.max(1, expected - config.reactivation.leadDays)), "10:05", salon.timezone);
  const report = await advanceClock(deps, Math.max(MINUTE, target - ctx.clock.now()));
  return { date: localDateOf(ctx.clock.now(), salon.timezone), tick: report };
}
