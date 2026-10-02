import { computeRoi, type RoiReport } from "@/domain/metrics";
import type { LocalDate } from "@/domain/model";
import { DAY, addDaysToDate, localDateOf, toIso } from "@/domain/time";
import type { AppContext } from "../context";

export interface MetricsView extends RoiReport {
  readonly currency: string;
  readonly staffNames: Readonly<Record<string, string>>;
  /** Lo que Slot Filler le devolvió al salón en el periodo. */
  readonly totalRecovered: number;
}

export async function metricsView(ctx: AppContext, range?: { from?: LocalDate; to?: LocalDate }): Promise<MetricsView> {
  const salon = await ctx.store.salon.get();
  const today = localDateOf(ctx.clock.now(), salon.timezone);
  const to = range?.to ?? today;
  const from = range?.from ?? addDaysToDate(to, -29);
  const now = ctx.clock.now();
  const [staff, services, appointments, blocks, gaps, nudges] = await Promise.all([
    ctx.store.staff.list(),
    ctx.store.services.list(),
    ctx.store.appointments.list({ from: toIso(now - 120 * DAY), to: toIso(now + 60 * DAY) }),
    ctx.store.blocks.list(),
    ctx.store.gaps.list(),
    ctx.store.nudges.list(),
  ]);
  const report = computeRoi({ snapshot: { timezone: salon.timezone, staff, services, appointments, blocks }, gaps, nudges, from, to });
  return {
    ...report,
    currency: salon.currency,
    staffNames: Object.fromEntries(staff.map((s) => [s.id, s.name])),
    totalRecovered: report.revenueRecovered + report.revenueReactivated,
  };
}
