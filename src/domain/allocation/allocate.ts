import { type Staff, staffCanPerform } from "../model";
import { HOUR, MINUTE, addDaysToDate, candidateStarts, localDateOf, timeToMinutes, minutesToTime, toIso, workingIntervals, zonedInstant } from "../time";
import { createScorer } from "./scoring";
import type { AllocationContext, AllocationReason, AllocationResult, BookingRequest, SlotKind, SlotOption } from "./types";

interface Candidate {
  readonly staff: Staff;
  readonly date: string;
  readonly start: number;
  readonly kind: SlotKind;
  readonly score: number;
}

const MIN_SPACING = HOUR;
const KIND_PRIORITY: readonly SlotKind[] = ["same_staff_other_time", "other_staff_same_day", "other_time", "other_staff_other_day"];

const empty = (reason: AllocationReason): AllocationResult => ({ status: "none", reason, matches: [], alternatives: [] });

/**
 * Motor de asignación multi-recurso. Dada una petición interpretada, devuelve:
 * - `matches`: slots que cumplen lo pedido (estilista/día/hora o franja), ya balanceados;
 * - `alternatives`: si no hay, lo más cercano — mismo estilista otra hora, u otro estilista con la especialidad.
 */
export function allocate(request: BookingRequest, ctx: AllocationContext): AllocationResult {
  const { snapshot, now, config } = ctx;
  const tz = snapshot.timezone;
  const service = snapshot.services.find((s) => s.id === request.serviceId && s.active);
  if (!service) return empty("unknown_service");

  const eligible = snapshot.staff.filter((s) => staffCanPerform(s, service));
  const requested = request.staffId === undefined ? undefined : snapshot.staff.find((s) => s.id === request.staffId);
  const requestedEligible = requested && staffCanPerform(requested, service) ? requested : undefined;

  const today = localDateOf(now, tz);
  const targetDate = request.date !== undefined && request.date > today ? request.date : today;
  const window = request.time === undefined ? request.window : undefined;
  const targetTime = request.time ?? (window ? minutesToTime((timeToMinutes(window.from) + timeToMinutes(window.to)) / 2) : "12:00");
  const target = zonedInstant(targetDate, targetTime, tz);
  const exact = request.time === undefined ? undefined : zonedInstant(targetDate, request.time, tz);

  const fitsRequest = (date: string, start: number): boolean => {
    if (date !== targetDate) return false;
    if (exact !== undefined) return start === exact;
    if (window) return start >= zonedInstant(date, window.from, tz) && start < zonedInstant(date, window.to, tz);
    return true;
  };

  const kindOf = (staff: Staff, date: string, start: number): SlotKind => {
    const staffMatches = requestedEligible === undefined || staff.id === requestedEligible.id;
    if (staffMatches && fitsRequest(date, start)) return "match";
    if (request.staffId === undefined) return "other_time";
    if (requestedEligible && staff.id === requestedEligible.id) return "same_staff_other_time";
    return date === targetDate ? "other_staff_same_day" : "other_staff_other_day";
  };

  const score = createScorer(snapshot, config);
  const horizonEnd = addDaysToDate(targetDate, config.slots.searchHorizonDays);
  const candidates: Candidate[] = [];
  for (let date = today; date <= horizonEnd; date = addDaysToDate(date, 1)) {
    for (const staff of eligible) {
      for (const start of candidateStarts(staff, service, date, snapshot, now, config.slots)) {
        candidates.push({
          staff,
          date,
          start,
          kind: kindOf(staff, date, start),
          score: score({
            staff,
            service,
            date,
            start,
            target,
            targetDate,
            requestedStaffId: requestedEligible?.id,
            preferredStaffId: request.preferredStaffId,
          }),
        });
      }
    }
  }

  const limit = config.allocation.maxAlternatives;
  const toOption = (c: Candidate): SlotOption => ({
    staffId: c.staff.id,
    serviceId: service.id,
    start: toIso(c.start),
    end: toIso(c.start + service.durationMinutes * MINUTE),
    kind: c.kind,
    score: c.score,
  });

  const matches = candidates.filter((c) => c.kind === "match");
  const reason = explainMiss(request, requested, requestedEligible, targetDate, tz);

  if (matches.length > 0) {
    const perStaff = requestedEligible ? limit : exact !== undefined ? 1 : config.allocation.maxPerStaff;
    return {
      status: "available",
      reason: requested && !requestedEligible ? reason : undefined,
      matches: pickDiverse(matches, limit, perStaff).map(toOption),
      alternatives: [],
    };
  }

  const others = candidates.filter((c) => c.kind !== "match");
  if (others.length === 0) return empty(reason);
  return {
    status: "alternatives",
    reason,
    matches: [],
    alternatives: pickAlternatives(others, limit, config.allocation.maxPerStaff).map(toOption),
  };
}

function explainMiss(
  request: BookingRequest,
  requested: Staff | undefined,
  requestedEligible: Staff | undefined,
  targetDate: string,
  tz: string,
): AllocationReason {
  if (request.staffId !== undefined && !requested) return "unknown_staff";
  if (requested && !requestedEligible) return "staff_lacks_specialty";
  if (requestedEligible) {
    if (workingIntervals(requestedEligible, targetDate, tz).length === 0) return "staff_off";
    return request.time === undefined ? "staff_full" : "time_taken";
  }
  return request.time === undefined ? "no_capacity" : "time_taken";
}

const byScore = (a: Candidate, b: Candidate) => b.score - a.score || a.start - b.start;

/** Toma los mejores sin repetir demasiado estilista ni proponer horas pegadas entre sí. */
function pickDiverse(pool: readonly Candidate[], limit: number, maxPerStaff: number, seed: readonly Candidate[] = []): Candidate[] {
  return [...pool].sort(byScore).reduce<Candidate[]>((picked, c) => {
    if (picked.length >= limit || picked.includes(c)) return picked;
    const sameStaff = picked.filter((p) => p.staff.id === c.staff.id);
    const tooClose = sameStaff.some((p) => Math.abs(p.start - c.start) < MIN_SPACING);
    return sameStaff.length < maxPerStaff && !tooClose ? [...picked, c] : picked;
  }, [...seed]);
}

/** Garantiza variedad: lo mejor de cada tipo de alternativa primero, luego relleno por puntaje. */
function pickAlternatives(pool: readonly Candidate[], limit: number, maxPerStaff: number): Candidate[] {
  const leaders = KIND_PRIORITY.map((kind) => [...pool].filter((c) => c.kind === kind).sort(byScore)[0])
    .filter((c): c is Candidate => c !== undefined)
    .slice(0, limit);
  return pickDiverse(pool, limit, maxPerStaff, leaders).sort(byScore);
}

