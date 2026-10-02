import type { Appointment, Block, LocalDate, Service, Staff } from "../model";
import { type Interval, clipInterval, overlaps, subtractIntervals, totalDuration } from "./intervals";
import { MINUTE, fromIso, localDateOf, weekdayOfDate, zonedInstant } from "./zoned";

/** Foto de la agenda que necesitan los motores puros (asignación, relleno, métricas). */
export interface ScheduleSnapshot {
  readonly timezone: string;
  readonly staff: readonly Staff[];
  readonly services: readonly Service[];
  readonly appointments: readonly Appointment[];
  readonly blocks: readonly Block[];
}

export interface SlotRules {
  readonly granularityMinutes: number;
  readonly minLeadMinutes: number;
}

export function workingIntervals(staff: Staff, date: LocalDate, timezone: string): Interval[] {
  const ranges = staff.schedule[weekdayOfDate(date)] ?? [];
  return ranges.map((r) => ({ start: zonedInstant(date, r.start, timezone), end: zonedInstant(date, r.end, timezone) }));
}

function bufferFor(serviceId: string, services: readonly Service[]): number {
  return (services.find((s) => s.id === serviceId)?.bufferMinutes ?? 0) * MINUTE;
}

/** Tiempo ocupado de un estilista: citas vigentes (+ buffer de limpieza) y bloqueos. */
export function busyIntervals(staffId: string, snapshot: ScheduleSnapshot, excludeAppointmentId?: string): Interval[] {
  const fromAppointments = snapshot.appointments
    .filter((a) => a.staffId === staffId && a.id !== excludeAppointmentId && (a.status === "booked" || a.status === "completed"))
    .map((a) => ({ start: fromIso(a.start), end: fromIso(a.end) + bufferFor(a.serviceId, snapshot.services) }));
  const fromBlocks = snapshot.blocks
    .filter((b) => b.staffId === staffId)
    .map((b) => ({ start: fromIso(b.start), end: fromIso(b.end) }));
  return [...fromAppointments, ...fromBlocks];
}

/** Tramos libres de un estilista en un día, sin incluir lo que ya pasó (+ antelación mínima). */
export function freeIntervals(staff: Staff, date: LocalDate, snapshot: ScheduleSnapshot, now: number, rules: SlotRules): Interval[] {
  const earliest = now + rules.minLeadMinutes * MINUTE;
  const working = workingIntervals(staff, date, snapshot.timezone)
    .map((w) => clipInterval(w, { start: earliest, end: Number.MAX_SAFE_INTEGER }))
    .filter((w): w is Interval => w !== undefined);
  return subtractIntervals(working, busyIntervals(staff.id, snapshot));
}

/** Horas de inicio posibles para un servicio, alineadas a la grilla local del salón. */
export function candidateStarts(
  staff: Staff,
  service: Service,
  date: LocalDate,
  snapshot: ScheduleSnapshot,
  now: number,
  rules: SlotRules,
): number[] {
  const step = rules.granularityMinutes * MINUTE;
  const needed = (service.durationMinutes + service.bufferMinutes) * MINUTE;
  const dayStart = zonedInstant(date, "00:00", snapshot.timezone);
  return freeIntervals(staff, date, snapshot, now, rules).flatMap((free) => {
    const starts: number[] = [];
    const first = dayStart + Math.ceil((free.start - dayStart) / step) * step;
    for (let s = first; s + needed <= free.end; s += step) starts.push(s);
    return starts;
  });
}

/** ¿Cabe [start, end) en el horario del estilista sin chocar con nada? */
export function isSlotFree(
  staff: Staff,
  interval: Interval,
  snapshot: ScheduleSnapshot,
  excludeAppointmentId?: string,
): boolean {
  const dates = new Set([localDateOf(interval.start, snapshot.timezone), localDateOf(interval.end - 1, snapshot.timezone)]);
  const working = [...dates].flatMap((d) => workingIntervals(staff, d, snapshot.timezone));
  const insideWorking = working.some((w) => w.start <= interval.start && interval.end <= w.end);
  return insideWorking && !busyIntervals(staff.id, snapshot, excludeAppointmentId).some((b) => overlaps(b, interval));
}

/** Fracción del día laboral de un estilista que ya está ocupada (0–1). */
export function utilization(staff: Staff, date: LocalDate, snapshot: ScheduleSnapshot): number {
  const working = workingIntervals(staff, date, snapshot.timezone);
  const workingTotal = totalDuration(working);
  if (workingTotal === 0) return 1;
  const busyInside = busyIntervals(staff.id, snapshot)
    .flatMap((b) => working.map((w) => clipInterval(b, w)))
    .filter((i): i is Interval => i !== undefined);
  return Math.min(1, totalDuration(busyInside) / workingTotal);
}
