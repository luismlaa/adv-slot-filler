import { describe, expect, it } from "vitest";
import { seedDemo, PERSONAS } from "@/adapters/memory/seed";
import { defaultBusinessConfig as config } from "@/config/business";
import { allocate } from "@/domain/allocation";
import { analyzeCycles, returningThisWeek } from "@/domain/cycles";
import { gapFromCancellation, rankCandidates } from "@/domain/gapfill";
import { computeRoi } from "@/domain/metrics";
import {
  appointmentSchema,
  clientSchema,
  gapSchema,
  messageSchema,
  nudgeSchema,
  offerSchema,
  serviceSchema,
  staffSchema,
  waitlistEntrySchema,
} from "@/domain/model";
import { addDaysToDate, localParts, startOfWeekDate, zonedInstant } from "@/domain/time";

const TZ = "America/Santo_Domingo";
const anchor = zonedInstant("2026-10-01", "10:00", TZ);
const seed = seedDemo({ anchor });
const { db } = seed;
const snapshot = { timezone: TZ, staff: db.staff, services: db.services, appointments: db.appointments, blocks: db.blocks };
const saturday = addDaysToDate(seed.anchorDate, 2);
const cycles = analyzeCycles({ appointments: db.appointments, services: db.services, timezone: TZ, today: seed.anchorDate, now: anchor, params: config.cycles });

describe("seed de la demo", () => {
  it("es determinista", () => {
    expect(seedDemo({ anchor }).db).toEqual(db);
  });

  it("todos los registros cumplen los esquemas", () => {
    const checks: [{ parse: (v: unknown) => unknown }, readonly unknown[]][] = [
      [staffSchema, db.staff],
      [serviceSchema, db.services],
      [clientSchema, db.clients],
      [appointmentSchema, db.appointments],
      [waitlistEntrySchema, db.waitlist],
      [gapSchema, db.gaps],
      [offerSchema, db.offers],
      [nudgeSchema, db.nudges],
      [messageSchema, db.messages],
    ];
    for (const [schema, rows] of checks) for (const row of rows) schema.parse(row);
    expect(db.clients.length).toBeGreaterThanOrEqual(150);
    expect(db.appointments.length).toBeGreaterThan(800);
  });

  it("ningún estilista tiene citas vigentes solapadas", () => {
    const active = db.appointments.filter((a) => a.status === "booked" || a.status === "completed");
    for (const staff of db.staff) {
      const mine = active.filter((a) => a.staffId === staff.id).sort((a, b) => a.start.localeCompare(b.start));
      for (let i = 1; i < mine.length; i++) expect(mine[i]!.start >= mine[i - 1]!.end).toBe(true);
    }
  });

  it("lo anterior al 'ahora' está cerrado y lo posterior reservado", () => {
    for (const a of db.appointments) {
      if (a.status === "booked") expect(Date.parse(a.start)).toBeGreaterThanOrEqual(anchor);
      if (a.status === "completed") expect(Date.parse(a.start)).toBeLessThan(anchor);
    }
  });
});

describe("guion de pitch", () => {
  it("escena 1: Carlos está lleno el sábado → hueco cercano con Carlos o Luis/Rafa el sábado", () => {
    const result = allocate({ serviceId: "svc-fade", staffId: "staff-carlos", date: saturday }, { snapshot, now: anchor, config });
    expect(result.status).toBe("alternatives");
    expect(result.reason).toBe("staff_full");
    const same = result.alternatives.find((a) => a.kind === "same_staff_other_time");
    const other = result.alternatives.find((a) => a.kind === "other_staff_same_day");
    expect(same?.staffId).toBe("staff-carlos");
    expect(["staff-luis", "staff-rafa"]).toContain(other?.staffId);
    expect(localParts(Date.parse(other!.start), TZ).date).toBe(saturday);
  });

  it("Pedro vuelve cada ~4 semanas con Carlos y le toca esta semana", () => {
    const pedro = cycles.find((c) => c.clientId === PERSONAS.pedro.id)!;
    expect(pedro).toMatchObject({ category: "corte", usualStaffId: "staff-carlos", usualServiceId: "svc-fade", status: "due" });
    expect(pedro.expectedDays).toBeGreaterThanOrEqual(27);
    expect(pedro.expectedDays).toBeLessThanOrEqual(29);
  });

  it("escena 2: si Juan cancela el sábado, la primera oferta va a José (lista de espera)", () => {
    const juan = db.appointments.find((a) => a.id === seed.juanSaturdayAppointmentId)!;
    expect(juan).toMatchObject({ clientId: PERSONAS.juan.id, staffId: "staff-carlos", status: "booked" });
    expect(localParts(Date.parse(juan.start), TZ)).toMatchObject({ date: saturday, time: "16:00" });
    const cancelled = { ...juan, status: "cancelled" as const };
    const gap = gapFromCancellation(cancelled, anchor, config.gapfill, "gap-test")!;
    const ranked = rankCandidates({
      gap,
      snapshot: { ...snapshot, appointments: db.appointments.map((a) => (a.id === juan.id ? cancelled : a)) },
      waitlist: db.waitlist,
      cycles,
      clients: db.clients,
      offers: db.offers,
      now: anchor,
      params: config.gapfill,
    });
    expect(ranked[0]).toMatchObject({ clientId: PERSONAS.jose.id, source: "waitlist" });
    expect(ranked.length).toBeGreaterThanOrEqual(3);
  });

  it("el panel 'por volver esta semana' tiene clientes, incluidos Pedro y Ana", () => {
    const panel = returningThisWeek(cycles, startOfWeekDate(seed.anchorDate));
    expect(panel.length).toBeGreaterThanOrEqual(10);
    const ids = panel.map((c) => c.clientId);
    expect(ids).toContain(PERSONAS.pedro.id);
    expect(ids).toContain(PERSONAS.ana.id);
  });

  it("el ROI de los últimos 30 días muestra ingresos recuperados y reactivados", () => {
    const roi = computeRoi({ snapshot, gaps: db.gaps, nudges: db.nudges, from: addDaysToDate(seed.anchorDate, -30), to: seed.anchorDate });
    expect(roi.revenueRecovered).toBeGreaterThan(0);
    expect(roi.revenueReactivated).toBeGreaterThan(0);
    expect(roi.fillRate).toBeGreaterThan(0.5);
    expect(roi.occupancy).toBeGreaterThan(0.3);
  });
});
