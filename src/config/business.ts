import { z } from "zod";
import raw from "../../config/business.json";

const positive = z.number().positive();
const nonNegative = z.number().nonnegative();
const automationMode = z.enum(["auto", "off"]);

export const businessConfigSchema = z.object({
  slots: z.object({
    granularityMinutes: z.number().int().min(5).max(60),
    minLeadMinutes: z.number().int().nonnegative(),
    searchHorizonDays: z.number().int().min(1).max(60),
  }),
  allocation: z.object({
    maxAlternatives: z.number().int().min(1).max(10),
    maxPerStaff: z.number().int().min(1),
    weights: z.object({
      requestedStaff: nonNegative,
      preferredStaff: nonNegative,
      timeDistancePerHour: nonNegative,
      dayDistance: nonNegative,
      loadBalance: nonNegative,
      fragmentation: nonNegative,
    }),
  }),
  gapfill: z.object({
    mode: automationMode,
    offerTtlMinutes: z.number().int().positive(),
    waveSize: z.number().int().positive(),
    maxWaves: z.number().int().positive(),
    minNoticeMinutes: z.number().int().nonnegative(),
    recentOfferCooldownDays: nonNegative,
    weights: z.object({
      waitlist: nonNegative,
      waitlistAgePerDay: nonNegative,
      staffMatch: nonNegative,
      cycleDue: nonNegative,
      cycleOverdue: nonNegative,
    }),
  }),
  cycles: z.object({
    minIntervalDays: positive,
    recencyHalfLife: positive,
    shrinkK: nonNegative,
    outlierFactor: z.number().min(1),
    dueWindowBeforeDays: nonNegative,
    dueWindowAfterDays: nonNegative,
    atRiskFactor: z.number().min(1),
    lookbackDays: z.number().int().positive(),
  }),
  reactivation: z.object({
    mode: automationMode,
    leadDays: nonNegative,
    renudgeAfterDays: positive,
    maxPerRun: z.number().int().positive(),
    sendHourLocal: z.number().int().min(0).max(23),
    slotsToOffer: z.number().int().min(1).max(5),
  }),
  messaging: z.object({
    quietHoursStart: z.number().int().min(0).max(23),
    quietHoursEnd: z.number().int().min(0).max(23),
    maxPerMinute: z.number().int().positive(),
  }),
});

export type BusinessConfig = z.infer<typeof businessConfigSchema>;

export const defaultBusinessConfig: BusinessConfig = businessConfigSchema.parse(raw);

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };
export type BusinessConfigOverrides = DeepPartial<BusinessConfig>;

function mergeDeep<T>(base: T, overrides: DeepPartial<T> | undefined): T {
  if (overrides === undefined) return base;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [key, value] of Object.entries(overrides as Record<string, unknown>)) {
    if (value === undefined) continue;
    const current = out[key];
    out[key] =
      value !== null && typeof value === "object" && !Array.isArray(value) && typeof current === "object"
        ? mergeDeep(current, value as DeepPartial<typeof current>)
        : value;
  }
  return out as T;
}

/** Aplica las preferencias de un salón sobre la configuración base y valida el resultado. */
export function resolveBusinessConfig(overrides?: BusinessConfigOverrides): BusinessConfig {
  return businessConfigSchema.parse(mergeDeep(defaultBusinessConfig, overrides));
}
