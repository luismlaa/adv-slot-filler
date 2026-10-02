import type { Appointment, Client, Id, LocalDate, Nudge, Service, ServiceCategory } from "../model";
import { addDaysToDate, daysBetweenDates, fromIso, localDateOf } from "../time";
import { type CycleParams, type CycleStatus, classifyCycle, estimateCycle } from "./estimate";

/** El ciclo de un cliente en una categoría (corte, barba…), listo para paneles y automatismos. */
export interface ClientCycle {
  readonly clientId: Id;
  readonly category: ServiceCategory;
  readonly visits: number;
  readonly expectedDays: number;
  readonly confidence: number;
  readonly source: "history" | "default";
  readonly lastVisitDate: LocalDate;
  readonly lastVisitAppointmentId: Id;
  readonly dueDate: LocalDate;
  readonly daysSinceLast: number;
  readonly daysUntilDue: number;
  readonly status: CycleStatus;
  /** Servicio que más pide en esta categoría — el que se le ofrece. */
  readonly usualServiceId: Id;
  /** Estilista con el que más va últimamente. */
  readonly usualStaffId: Id;
}

export interface CycleInput {
  readonly appointments: readonly Appointment[];
  readonly services: readonly Service[];
  readonly timezone: string;
  readonly today: LocalDate;
  readonly now: number;
  readonly params: CycleParams;
}

function mostFrequent(ids: readonly Id[]): Id {
  const counts = new Map<Id, number>();
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  // En empate gana el más reciente (las listas vienen en orden cronológico).
  return [...ids].reverse().reduce((best, id) => ((counts.get(id) ?? 0) > (counts.get(best) ?? 0) ? id : best), ids.at(-1)!);
}

/** Calcula los ciclos de todos los clientes con historial. Pura: no toca I/O. */
export function analyzeCycles(input: CycleInput): ClientCycle[] {
  const { appointments, services, timezone, today, now, params } = input;
  const serviceById = new Map(services.map((s) => [s.id, s]));
  const since = addDaysToDate(today, -params.lookbackDays);

  type Group = { clientId: Id; category: ServiceCategory; visits: Appointment[]; hasFuture: boolean };
  const groups = new Map<string, Group>();
  const groupFor = (clientId: Id, category: ServiceCategory) => {
    const key = `${clientId}|${category}`;
    const existing = groups.get(key);
    if (existing) return existing;
    const created: Group = { clientId, category, visits: [], hasFuture: false };
    groups.set(key, created);
    return created;
  };

  for (const a of [...appointments].sort((x, y) => x.start.localeCompare(y.start))) {
    const service = serviceById.get(a.serviceId);
    if (!service) continue;
    if (a.status === "completed" && localDateOf(fromIso(a.start), timezone) >= since) {
      groupFor(a.clientId, service.category).visits.push(a);
    } else if (a.status === "booked" && fromIso(a.start) > now) {
      groupFor(a.clientId, service.category).hasFuture = true;
    }
  }

  return [...groups.values()]
    .filter((g) => g.visits.length > 0)
    .map((g) => {
      const last = g.visits.at(-1)!;
      const usualServiceId = mostFrequent(g.visits.map((v) => v.serviceId));
      const defaultDays = serviceById.get(usualServiceId)?.defaultCycleDays ?? 28;
      const dates = g.visits.map((v) => localDateOf(fromIso(v.start), timezone));
      const estimate = estimateCycle(dates, defaultDays, params);
      const lastVisitDate = localDateOf(fromIso(last.start), timezone);
      const status = classifyCycle(lastVisitDate, estimate.expectedDays, today, g.hasFuture, params);
      return {
        clientId: g.clientId,
        category: g.category,
        visits: g.visits.length,
        expectedDays: estimate.expectedDays,
        confidence: estimate.confidence,
        source: estimate.source,
        lastVisitDate,
        lastVisitAppointmentId: last.id,
        dueDate: status.dueDate,
        daysSinceLast: status.daysSinceLast,
        daysUntilDue: status.daysUntilDue,
        status: status.status,
        usualServiceId,
        usualStaffId: mostFrequent(g.visits.slice(-5).map((v) => v.staffId)),
      };
    });
}

/** Panel "clientes por volver esta semana": les toca entre lunes y domingo, o ya se pasaron, y no tienen cita. */
export function returningThisWeek(cycles: readonly ClientCycle[], weekStart: LocalDate): ClientCycle[] {
  const weekEnd = addDaysToDate(weekStart, 6);
  const priority: Record<CycleStatus, number> = { overdue: 0, due: 1, at_risk: 2, ok: 3, booked: 4 };
  return cycles
    .filter((c) => c.status !== "booked")
    .filter((c) => (c.dueDate >= weekStart && c.dueDate <= weekEnd) || c.status === "overdue" || c.status === "due")
    .sort((a, b) => priority[a.status] - priority[b.status] || a.dueDate.localeCompare(b.dueDate));
}

export interface NudgeSelectionInput {
  readonly cycles: readonly ClientCycle[];
  readonly clients: readonly Client[];
  readonly nudges: readonly Nudge[];
  readonly today: LocalDate;
  readonly timezone: string;
  readonly leadDays: number;
  readonly renudgeAfterDays: number;
  readonly maxPerRun: number;
}

/**
 * Quién recibe hoy el "ya te toca": su fecha esperada llegó (menos la antelación),
 * no tiene cita, no pidió baja, y no se le invitó ya en este ciclo. Si ignoró la invitación,
 * se le recuerda una sola vez más tras `renudgeAfterDays`.
 */
export function selectNudges(input: NudgeSelectionInput): ClientCycle[] {
  const optedOut = new Set(input.clients.filter((c) => c.optedOut).map((c) => c.id));
  const known = new Set(input.clients.map((c) => c.id));
  const MAX_NUDGES_PER_CYCLE = 2;
  const nudgesThisCycle = (cycle: ClientCycle) =>
    input.nudges
      .filter((n) => n.clientId === cycle.clientId && n.category === cycle.category)
      .filter((n) => n.lastVisitAppointmentId === cycle.lastVisitAppointmentId)
      .sort((a, b) => b.sentAt.localeCompare(a.sentAt));

  return input.cycles
    .filter((c) => c.status === "due" || c.status === "overdue" || c.status === "at_risk")
    .filter((c) => known.has(c.clientId) && !optedOut.has(c.clientId))
    .filter((c) => daysBetweenDates(input.today, c.dueDate) <= input.leadDays)
    .filter((c) => {
      const previous = nudgesThisCycle(c);
      const latest = previous[0];
      if (!latest) return true;
      const unanswered = latest.status === "sent" || latest.status === "ignored";
      if (previous.length >= MAX_NUDGES_PER_CYCLE || !unanswered) return false;
      const daysAgo = daysBetweenDates(localDateOf(fromIso(latest.sentAt), input.timezone), input.today);
      return daysAgo >= input.renudgeAfterDays;
    })
    .sort((a, b) => b.confidence - a.confidence || a.dueDate.localeCompare(b.dueDate))
    .slice(0, input.maxPerRun);
}
