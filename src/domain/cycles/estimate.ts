import type { BusinessConfig } from "@/config/business";
import type { LocalDate } from "../model";
import { addDaysToDate, daysBetweenDates } from "../time";

export type CycleParams = BusinessConfig["cycles"];

export interface CycleEstimate {
  /** Días esperados entre visitas. */
  readonly expectedDays: number;
  /** 0–1: cuánto confiamos en el patrón (más visitas y más regulares = más alto). */
  readonly confidence: number;
  /** Intervalos usados (sin atípicos), en días. */
  readonly intervals: readonly number[];
  readonly source: "history" | "default";
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Mediana ponderada: cada valor pesa `weights[i]`. */
function weightedMedian(values: readonly number[], weights: readonly number[]): number {
  const pairs = values.map((v, i) => ({ v, w: weights[i] ?? 0 })).sort((a, b) => a.v - b.v);
  const half = pairs.reduce((s, p) => s + p.w, 0) / 2;
  let acc = 0;
  for (const p of pairs) {
    acc += p.w;
    if (acc >= half) return p.v;
  }
  return pairs.at(-1)?.v ?? 0;
}

/** Intervalos en días entre visitas consecutivas (fechas locales, ordenadas). */
export function visitIntervals(visitDates: readonly LocalDate[], minIntervalDays: number): number[] {
  const sorted = [...visitDates].sort();
  return sorted
    .slice(1)
    .map((d, i) => daysBetweenDates(sorted[i]!, d))
    .filter((days) => days >= minIntervalDays);
}

/**
 * Estima el ciclo real de un cliente.
 * 1. Descarta atípicos (vacaciones, retoques) relativos a la mediana.
 * 2. Mediana ponderada hacia lo reciente (los hábitos cambian).
 * 3. Encoge hacia el ciclo típico del servicio cuando hay pocas visitas (shrinkage bayesiano).
 */
export function estimateCycle(visitDates: readonly LocalDate[], defaultCycleDays: number, params: CycleParams): CycleEstimate {
  const raw = visitIntervals(visitDates, params.minIntervalDays);
  if (raw.length === 0) {
    return { expectedDays: defaultCycleDays, confidence: 0.15, intervals: [], source: "default" };
  }
  const m = median(raw);
  const intervals = raw.filter((d) => d <= m * params.outlierFactor && d >= m / params.outlierFactor);
  const n = intervals.length;
  const weights = intervals.map((_, i) => 0.5 ** ((n - 1 - i) / params.recencyHalfLife));
  const wm = weightedMedian(intervals, weights);
  const expected = (n * wm + params.shrinkK * defaultCycleDays) / (n + params.shrinkK);

  const center = median(intervals);
  const mad = median(intervals.map((d) => Math.abs(d - center)));
  const regularity = Math.min(1, Math.max(0.1, 1 - mad / center));
  const sampleWeight = n / (n + params.shrinkK);

  return {
    expectedDays: Math.max(1, Math.round(expected)),
    confidence: round2(sampleWeight * regularity),
    intervals,
    source: "history",
  };
}

export type CycleStatus = "ok" | "due" | "overdue" | "at_risk" | "booked";

/**
 * Estado del cliente respecto a su ciclo, hoy.
 * - ok: aún no le toca · due: dentro de la ventana "por volver" · overdue: pasado de la ventana
 * - at_risk: ≥ atRiskFactor × su ciclo sin volver · booked: ya tiene cita futura
 */
export function classifyCycle(
  lastVisit: LocalDate,
  expectedDays: number,
  today: LocalDate,
  hasFutureBooking: boolean,
  params: CycleParams,
): { status: CycleStatus; dueDate: LocalDate; daysSinceLast: number; daysUntilDue: number } {
  const dueDate = addDaysToDate(lastVisit, expectedDays);
  const daysSinceLast = daysBetweenDates(lastVisit, today);
  const daysUntilDue = daysBetweenDates(today, dueDate);
  const status: CycleStatus = hasFutureBooking
    ? "booked"
    : daysUntilDue > params.dueWindowBeforeDays
      ? "ok"
      : daysUntilDue >= -params.dueWindowAfterDays
        ? "due"
        : daysSinceLast >= params.atRiskFactor * expectedDays
          ? "at_risk"
          : "overdue";
  return { status, dueDate, daysSinceLast, daysUntilDue };
}
