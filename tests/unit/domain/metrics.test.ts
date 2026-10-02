import { describe, expect, it } from "vitest";
import { computeRoi } from "@/domain/metrics";
import type { Gap, Nudge } from "@/domain/model";
import { toIso, zonedInstant } from "@/domain/time";
import { SALON, TZ, appointment, snapshot } from "../../fixtures/salon";

const iso = (date: string, time: string) => toIso(zonedInstant(date, time, TZ));

describe("computeRoi", () => {
  const appts = [
    appointment("carlos", "2026-09-29", "09:00", 60, { status: "completed", price: 700 }),
    appointment("carlos", "2026-09-29", "10:00", 60, { status: "completed", price: 700, source: "gapfill" }),
    appointment("luis", "2026-09-30", "09:00", 60, { status: "completed", price: 500, source: "reactivation" }),
    appointment("luis", "2026-09-30", "10:00", 60, { status: "cancelled", price: 500 }),
  ];
  const gaps: Gap[] = [
    { id: "g1", salonId: SALON, staffId: "carlos", start: appts[1]!.start, end: appts[1]!.end, originAppointmentId: "x", status: "filled", wave: 1, createdAt: iso("2026-09-28", "18:00"), filledAt: iso("2026-09-28", "18:12") },
    { id: "g2", salonId: SALON, staffId: "luis", start: appts[3]!.start, end: appts[3]!.end, originAppointmentId: appts[3]!.id, status: "expired", wave: 3, createdAt: iso("2026-09-29", "08:00") },
  ];
  const nudges: Nudge[] = [
    { id: "n1", salonId: SALON, clientId: "a", category: "corte", serviceId: "fade", dueDate: "2026-09-30", lastVisitAppointmentId: "v1", status: "booked", sentAt: iso("2026-09-28", "10:00") },
    { id: "n2", salonId: SALON, clientId: "b", category: "corte", serviceId: "fade", dueDate: "2026-09-30", lastVisitAppointmentId: "v2", status: "sent", sentAt: iso("2026-09-28", "10:00") },
  ];
  const report = computeRoi({ snapshot: snapshot({ appointments: appts }), gaps, nudges, from: "2026-09-28", to: "2026-10-04" });

  it("cuenta lo recuperado por huecos y por reactivación", () => {
    expect(report).toMatchObject({
      appointments: 3,
      revenue: 1900,
      gapsCreated: 2,
      gapsFilled: 1,
      fillRate: 0.5,
      revenueRecovered: 700,
      avgMinutesToFill: 12,
      nudgesSent: 2,
      nudgesBooked: 1,
      reactivationRate: 0.5,
      revenueReactivated: 500,
    });
  });

  it("calcula ocupación por estilista sobre su horario", () => {
    const carlos = report.occupancyByStaff.find((o) => o.staffId === "carlos")!;
    expect(carlos.bookedMinutes).toBe(120);
    expect(carlos.workingMinutes).toBe(5 * 9 * 60);
    expect(report.weekly).toEqual([{ weekStart: "2026-09-28", recovered: 700, reactivated: 500 }]);
  });
});
