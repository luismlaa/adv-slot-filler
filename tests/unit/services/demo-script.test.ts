import { describe, expect, it } from "vitest";
import { FakeCalendarProvider } from "@/adapters/calendar/fake";
import { PERSONAS } from "@/adapters/memory/seed";
import { addDaysToDate, localDateOf } from "@/domain/time";
import { createCalendarSync } from "@/services/calendar-sync";
import type { AppContext } from "@/services/context";
import { type DemoDeps, STEP_IDS, runStep } from "@/services/demo-script";
import { boardView } from "@/services/views/board";
import { metricsView } from "@/services/views/metrics";
import { buildTestApp } from "../../fixtures/app";

describe("guion de la demo (/demo)", () => {
  const app = buildTestApp();
  const fake = new FakeCalendarProvider(() => app.clock.now());
  const sync = createCalendarSync(app.ctx, fake);
  const ctx: AppContext = { ...app.ctx, calendar: sync.hooks };
  const deps: DemoDeps = { ctx, clock: app.clock, calendar: fake, calendarSync: sync, calendarId: "carlos@gmail.com", calendarStaffId: "staff-carlos" };

  it("corre los pasos en orden y cada uno deja el estado esperado", async () => {
    await sync.connect("staff-carlos", "carlos@gmail.com");
    const results: Record<string, Awaited<ReturnType<typeof runStep>>> = {};
    for (const step of STEP_IDS) results[step] = await runStep(deps, step);

    expect(results["pedro-ask"]?.persona).toBe("pedro");
    expect(results["juan-confirm"]?.persona).toBe("jose");
    expect(results["jump-to-pedro-cycle"]?.note).toMatch(/Pasaron 4 semanas/);
    expect(results["jump-to-pedro-cycle"]?.tick?.reactivation.names).toContain("Pedro");

    const pedroAppointments = await ctx.store.appointments.list({ clientId: PERSONAS.pedro.id });
    expect(pedroAppointments.filter((a) => a.source === "reactivation" && a.status === "booked")).toHaveLength(1);
    const gapfilled = await ctx.store.appointments.list({ clientId: PERSONAS.jose.id });
    expect(gapfilled.some((a) => a.source === "gapfill")).toBe(true);
    expect((await ctx.store.blocks.list({ staffId: "staff-carlos" })).some((b) => b.title === "Cita médica")).toBe(true);
  });

  it("después del salto la agenda se ve viva y el ROI del último mes es coherente", async () => {
    const salon = await ctx.store.salon.get();
    const today = localDateOf(ctx.clock.now(), salon.timezone);
    const tomorrow = await boardView(ctx, addDaysToDate(today, 1));
    const busy = tomorrow.staff.filter((s) => s.working.length > 0);
    const avg = busy.reduce((sum, s) => sum + s.utilization, 0) / busy.length;
    expect(avg).toBeGreaterThan(0.45);

    const roi = await metricsView(ctx);
    expect(roi.occupancy).toBeGreaterThan(0.4);
    expect(roi.revenueRecovered).toBeGreaterThan(0);
    expect(roi.revenueReactivated).toBeGreaterThan(0);
  });
});
