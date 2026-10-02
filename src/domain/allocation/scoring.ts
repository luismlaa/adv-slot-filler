import type { BusinessConfig } from "@/config/business";
import type { LocalDate, Service, Staff } from "../model";
import { HOUR, type Interval, MINUTE, type ScheduleSnapshot, busyIntervals, daysBetweenDates, utilization, workingIntervals } from "../time";

export interface ScoreInput {
  readonly staff: Staff;
  readonly service: Service;
  readonly date: LocalDate;
  readonly start: number;
  /** Instante que el cliente tenía en mente (hora pedida, centro de la franja o mediodía). */
  readonly target: number;
  readonly targetDate: LocalDate;
  readonly requestedStaffId?: string;
  readonly preferredStaffId?: string;
}

/**
 * Puntúa un slot candidato. Más alto = mejor.
 * - cercanía a lo pedido (hora y día)
 * - estilista pedido / habitual
 * - balanceo de carga: favorece al estilista menos ocupado ese día
 * - fragmentación: favorece slots pegados a otras citas y castiga los que dejan huecos inútiles
 */
export function createScorer(snapshot: ScheduleSnapshot, config: BusinessConfig) {
  const w = config.allocation.weights;
  const shortest = Math.min(...snapshot.services.filter((s) => s.active).map((s) => s.durationMinutes)) * MINUTE;
  const utilizationCache = new Map<string, number>();
  const busyCache = new Map<string, Interval[]>();

  const utilizationOf = (staff: Staff, date: LocalDate) => {
    const key = `${staff.id}|${date}`;
    const cached = utilizationCache.get(key);
    if (cached !== undefined) return cached;
    const value = utilization(staff, date, snapshot);
    utilizationCache.set(key, value);
    return value;
  };

  const busyOf = (staffId: string) => {
    const cached = busyCache.get(staffId);
    if (cached) return cached;
    const value = busyIntervals(staffId, snapshot);
    busyCache.set(staffId, value);
    return value;
  };

  const fragmentation = (staff: Staff, date: LocalDate, slot: Interval) => {
    const boundaries = [...busyOf(staff.id), ...workingIntervals(staff, date, snapshot.timezone).flatMap((wi) => [
      { start: wi.start - 1, end: wi.start },
      { start: wi.end, end: wi.end + 1 },
    ])];
    const touchesBefore = boundaries.some((b) => b.end === slot.start);
    const touchesAfter = boundaries.some((b) => b.start === slot.end);
    const nearestBefore = Math.max(-Infinity, ...boundaries.filter((b) => b.end <= slot.start).map((b) => b.end));
    const nearestAfter = Math.min(Infinity, ...boundaries.filter((b) => b.start >= slot.end).map((b) => b.start));
    const orphanBefore = !touchesBefore && slot.start - nearestBefore < shortest ? 1 : 0;
    const orphanAfter = !touchesAfter && nearestAfter - slot.end < shortest ? 1 : 0;
    return (Number(touchesBefore) + Number(touchesAfter)) / 2 - (orphanBefore + orphanAfter) / 2;
  };

  return (input: ScoreInput): number => {
    const slot = { start: input.start, end: input.start + (input.service.durationMinutes + input.service.bufferMinutes) * MINUTE };
    const hoursAway = Math.abs(input.start - input.target) / HOUR;
    const daysAway = Math.abs(daysBetweenDates(input.targetDate, input.date));
    const staffBonus =
      input.staff.id === input.requestedStaffId
        ? w.requestedStaff
        : input.requestedStaffId === undefined && input.staff.id === input.preferredStaffId
          ? w.preferredStaff
          : 0;
    const score =
      staffBonus -
      w.timeDistancePerHour * Math.min(hoursAway, 24) -
      w.dayDistance * daysAway +
      w.loadBalance * (1 - utilizationOf(input.staff, input.date)) +
      w.fragmentation * fragmentation(input.staff, input.date, slot);
    return Math.round(score * 1000) / 1000;
  };
}
