import type { FakeCalendarProvider } from "@/adapters/calendar/fake";
import { PERSONAS, type PersonaKey } from "@/adapters/memory/seed";
import { createRng } from "@/adapters/memory/seed/rng";
import { staffCanPerform } from "@/domain/model";
import { DAY, MINUTE, addDaysToDate, candidateStarts, localDateOf, toIso, utilization, zonedInstant } from "@/domain/time";
import type { CalendarSync } from "./calendar-sync";
import type { AppContext } from "./context";
import { handleInbound } from "./conversation";
import { publish } from "./data";
import { type TickReport, tick } from "./jobs";
import { boardView } from "./views/board";

export interface DemoDeps {
  readonly ctx: AppContext;
  readonly clock: { advance(ms: number): number; set(instant: number): number };
  readonly calendar?: FakeCalendarProvider;
  readonly calendarSync: CalendarSync;
  readonly calendarId: string;
  readonly calendarStaffId: string;
}

export interface StepResult {
  /** Día que el tablero debe mostrar después del paso. */
  readonly focusDate?: string;
  /** Teléfono que el simulador debe mostrar. */
  readonly persona?: PersonaKey;
  readonly note: string;
  readonly tick?: TickReport;
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

async function saturday(ctx: AppContext) {
  const salon = await ctx.store.salon.get();
  const today = localDateOf(ctx.clock.now(), salon.timezone);
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
  return addDaysToDate(today, (6 - weekday + 7) % 7 || 7);
}

export const STEP_IDS = [
  "pedro-ask",
  "pedro-choose",
  "juan-cancel",
  "juan-confirm",
  "jose-accept",
  "jump-to-pedro-cycle",
  "pedro-yes",
  "carlos-google-event",
] as const;
export type StepId = (typeof STEP_IDS)[number];

/** Los pasos del guion de pitch. Cada uno usa los mismos casos de uso que producción. */
export async function runStep(deps: DemoDeps, step: StepId): Promise<StepResult> {
  const { ctx } = deps;
  const sat = await saturday(ctx);
  switch (step) {
    case "pedro-ask":
      await simulateInbound(ctx, PERSONAS.pedro.phone, "Klk, quiero un corte con Carlos el sábado");
      return { persona: "pedro", focusDate: sat, note: "Carlos está lleno el sábado: el sistema ofrece el hueco más cercano con Carlos u otro barbero que también hace fade." };
    case "pedro-choose":
      await simulateInbound(ctx, PERSONAS.pedro.phone, "la 1");
      return { persona: "pedro", note: "Pedro elige y queda reservado. Aparece en la agenda en vivo." };
    case "juan-cancel":
      await simulateInbound(ctx, PERSONAS.juan.phone, "Mano, no voy a poder ir el sábado 😔");
      return { persona: "juan", focusDate: sat, note: "Juan avisa por WhatsApp que no puede venir. El asistente confirma antes de cancelar." };
    case "juan-confirm":
      await simulateInbound(ctx, PERSONAS.juan.phone, "sí");
      return { persona: "jose", focusDate: sat, note: "Se libera el hueco del sábado 4:00 p. m. y sale la oferta a la lista de espera (José) y a clientes a los que les toca volver." };
    case "jose-accept":
      await simulateInbound(ctx, PERSONAS.jose.phone, "Sí!! Dame ese");
      return { persona: "jose", focusDate: sat, note: "José responde primero y se queda con el espacio. El hueco se rellenó solo, sin que nadie en el salón tocara nada." };
    case "jump-to-pedro-cycle": {
      const visits = await ctx.store.appointments.list({ clientId: PERSONAS.pedro.id, statuses: ["booked", "completed"] });
      const last = visits.sort((a, b) => b.start.localeCompare(a.start))[0];
      const salon = await ctx.store.salon.get();
      const lastDate = last ? localDateOf(Date.parse(last.start), salon.timezone) : localDateOf(ctx.clock.now(), salon.timezone);
      const target = zonedInstant(addDaysToDate(lastDate, 27), "10:05", salon.timezone);
      const jump = Math.max(MINUTE, target - ctx.clock.now());
      const report = await advanceClock(deps, jump);
      return {
        persona: "pedro",
        focusDate: localDateOf(target, salon.timezone),
        tick: report,
        note: `Pasaron ${Math.round(jump / (7 * DAY))} semanas. A las 10:00 el sistema invitó a ${report.reactivation.sent} clientes según su ciclo real, entre ellos Pedro.`,
      };
    }
    case "pedro-yes":
      await simulateInbound(ctx, PERSONAS.pedro.phone, "sí, dale");
      return { persona: "pedro", note: "Pedro reserva con un solo «sí». Volvió justo cuando le tocaba." };
    case "carlos-google-event": {
      if (!deps.calendar) return { note: "El calendario simulado solo está disponible en la demo." };
      const view = await boardView(ctx);
      for (let offset = 1; offset <= 5; offset += 1) {
        const day = addDaysToDate(view.today, offset);
        const free = (await boardView(ctx, day)).freeSlots.find((f) => f.staffId === deps.calendarStaffId && Date.parse(f.end) - Date.parse(f.start) >= 30 * MINUTE);
        if (!free) continue;
        const end = Math.min(Date.parse(free.end), Date.parse(free.start) + 60 * MINUTE);
        deps.calendar.addPersonalEvent(deps.calendarId, { title: "Cita médica", start: free.start, end: toIso(end) });
        await deps.calendarSync.syncStaff(deps.calendarStaffId);
        return { focusDate: day, note: "Carlos anotó «Cita médica» en SU Google Calendar. Slot Filler bloqueó ese tiempo solo: nadie podrá reservarlo." };
      }
      return { note: "Carlos no tiene espacios libres en los próximos días para el ejemplo." };
    }
  }
}
