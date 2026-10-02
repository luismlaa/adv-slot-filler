import type { Appointment, Gap, Id, LocalDate, Nudge, Staff } from "../model";
import {
  type Interval,
  MINUTE,
  type ScheduleSnapshot,
  addDaysToDate,
  busyIntervals,
  clipInterval,
  fromIso,
  localDateOf,
  startOfWeekDate,
  totalDuration,
  workingIntervals,
} from "../time";

export interface RoiInput {
  readonly snapshot: ScheduleSnapshot;
  readonly gaps: readonly Gap[];
  readonly nudges: readonly Nudge[];
  readonly from: LocalDate;
  readonly to: LocalDate;
}

export interface StaffOccupancy {
  readonly staffId: Id;
  readonly occupancy: number;
  readonly bookedMinutes: number;
  readonly workingMinutes: number;
}

export interface WeeklyPoint {
  readonly weekStart: LocalDate;
  readonly recovered: number;
  readonly reactivated: number;
}

export interface RoiReport {
  readonly from: LocalDate;
  readonly to: LocalDate;
  readonly appointments: number;
  readonly revenue: number;
  readonly gapsCreated: number;
  readonly gapsFilled: number;
  readonly fillRate: number;
  /** Ingresos de citas que entraron rellenando un hueco por cancelación. */
  readonly revenueRecovered: number;
  readonly avgMinutesToFill: number | null;
  readonly nudgesSent: number;
  readonly nudgesBooked: number;
  readonly reactivationRate: number;
  /** Ingresos de citas que entraron por una invitación de ciclo. */
  readonly revenueReactivated: number;
  readonly occupancy: number;
  readonly occupancyByStaff: readonly StaffOccupancy[];
  readonly weekly: readonly WeeklyPoint[];
}

const ratio = (a: number, b: number) => (b === 0 ? 0 : Math.round((a / b) * 1000) / 1000);

/** Retorno medible del producto en un periodo: lo que el salón recuperó gracias a Slot Filler. */
export function computeRoi(input: RoiInput): RoiReport {
  const { snapshot, from, to } = input;
  const tz = snapshot.timezone;
  const inPeriod = (iso: string) => {
    const d = localDateOf(fromIso(iso), tz);
    return d >= from && d <= to;
  };
  const kept = (a: Appointment) => a.status === "booked" || a.status === "completed";
  const appts = snapshot.appointments.filter((a) => kept(a) && inPeriod(a.start));
  const sum = (list: readonly Appointment[]) => list.reduce((s, a) => s + a.price, 0);

  const recovered = appts.filter((a) => a.source === "gapfill");
  const reactivated = appts.filter((a) => a.source === "reactivation");
  const gaps = input.gaps.filter((g) => inPeriod(g.createdAt));
  const filled = gaps.filter((g) => g.status === "filled" && g.filledAt !== undefined);
  const fillMinutes = filled.map((g) => (fromIso(g.filledAt!) - fromIso(g.createdAt)) / MINUTE);
  const nudges = input.nudges.filter((n) => inPeriod(n.sentAt));

  const occupancyByStaff = snapshot.staff.map((s) => occupancyOf(s, snapshot, from, to));
  const totalWorking = occupancyByStaff.reduce((s, o) => s + o.workingMinutes, 0);
  const totalBooked = occupancyByStaff.reduce((s, o) => s + o.bookedMinutes, 0);

  const weeks = new Map<LocalDate, { recovered: number; reactivated: number }>();
  for (let w = startOfWeekDate(from); w <= to; w = addDaysToDate(w, 7)) weeks.set(w, { recovered: 0, reactivated: 0 });
  for (const a of [...recovered, ...reactivated]) {
    const week = startOfWeekDate(localDateOf(fromIso(a.start), tz));
    const bucket = weeks.get(week);
    if (!bucket) continue;
    weeks.set(week, {
      recovered: bucket.recovered + (a.source === "gapfill" ? a.price : 0),
      reactivated: bucket.reactivated + (a.source === "reactivation" ? a.price : 0),
    });
  }

  return {
    from,
    to,
    appointments: appts.length,
    revenue: sum(appts),
    gapsCreated: gaps.length,
    gapsFilled: filled.length,
    fillRate: ratio(filled.length, gaps.length),
    revenueRecovered: sum(recovered),
    avgMinutesToFill: fillMinutes.length === 0 ? null : Math.round(fillMinutes.reduce((s, m) => s + m, 0) / fillMinutes.length),
    nudgesSent: nudges.length,
    nudgesBooked: nudges.filter((n) => n.status === "booked").length,
    reactivationRate: ratio(nudges.filter((n) => n.status === "booked").length, nudges.length),
    revenueReactivated: sum(reactivated),
    occupancy: ratio(totalBooked, totalWorking),
    occupancyByStaff,
    weekly: [...weeks.entries()].map(([weekStart, v]) => ({ weekStart, ...v })),
  };
}

function occupancyOf(staff: Staff, snapshot: ScheduleSnapshot, from: LocalDate, to: LocalDate): StaffOccupancy {
  const busy = busyIntervals(staff.id, { ...snapshot, blocks: [] });
  let working = 0;
  let booked = 0;
  for (let d = from; d <= to; d = addDaysToDate(d, 1)) {
    const day = workingIntervals(staff, d, snapshot.timezone);
    working += totalDuration(day);
    booked += totalDuration(busy.flatMap((b) => day.map((w) => clipInterval(b, w))).filter((i): i is Interval => i !== undefined));
  }
  return {
    staffId: staff.id,
    occupancy: ratio(booked, working),
    bookedMinutes: Math.round(booked / MINUTE),
    workingMinutes: Math.round(working / MINUTE),
  };
}
