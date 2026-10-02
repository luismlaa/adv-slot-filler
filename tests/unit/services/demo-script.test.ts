import { describe, expect, it } from "vitest";
import { FakeCalendarProvider } from "@/adapters/calendar/fake";
import { PERSONAS } from "@/adapters/memory/seed";
import { addDaysToDate, localDateOf } from "@/domain/time";
import { createCalendarSync } from "@/services/calendar-sync";
import type { AppContext } from "@/services/context";
import { type DemoDeps, advanceToClientCycle, simulateInbound } from "@/services/demo-script";
import { boardView } from "@/services/views/board";
import { metricsView } from "@/services/views/metrics";
import { buildTestApp } from "../../fixtures/app";

describe("pitch sobre el producto real (/chat + presentador)", () => {
  const app = buildTestApp();
  const fake = new FakeCalendarProvider(() => app.clock.now());
  const sync = createCalendarSync(app.ctx, fake);
  const ctx: AppContext = { ...app.ctx, calendar: sync.hooks };
  const deps: DemoDeps = { ctx, clock: app.clock, calendar: fake, calendarSync: sync, calendarId: "carlos@gmail.com", calendarStaffId: "staff-carlos" };

  it("el pitch escribiendo en el chat deja el estado esperado", async () => {
    await sync.connect("staff-carlos", "carlos@gmail.com");
    const lastOut = async (phone: string) => (await ctx.store.messages.list({ phone })).filter((m) => m.direction === "out").at(-1)?.text ?? "";

    await simulateInbound(ctx, PERSONAS.pedro.phone, "Klk, quiero un corte con Carlos el sábado");
    expect(await lastOut(PERSONAS.pedro.phone)).toMatch(/Carlos está lleno el sábado/);
    await simulateInbound(ctx, PERSONAS.pedro.phone, "la 1");
    expect(await lastOut(PERSONAS.pedro.phone)).toMatch(/Listo ✅/);

    await simulateInbound(ctx, PERSONAS.juan.phone, "Mano, no voy a poder ir el sábado 😔");
    await simulateInbound(ctx, PERSONAS.juan.phone, "sí");
    expect(await lastOut(PERSONAS.jose.phone)).toMatch(/Se liberó un espacio con Carlos/);
    await simulateInbound(ctx, PERSONAS.jose.phone, "Sí!! Dame ese");

    const jump = await advanceToClientCycle(deps, PERSONAS.pedro.id);
    expect(jump.tick.reactivation.names).toContain("Pedro");
    expect(await lastOut(PERSONAS.pedro.phone)).toMatch(/Ya van 4 semanas/);
    await simulateInbound(ctx, PERSONAS.pedro.phone, "sí, dale");

    const pedroAppointments = await ctx.store.appointments.list({ clientId: PERSONAS.pedro.id });
    expect(pedroAppointments.filter((a) => a.source === "reactivation" && a.status === "booked")).toHaveLength(1);
    const gapfilled = await ctx.store.appointments.list({ clientId: PERSONAS.jose.id });
    expect(gapfilled.some((a) => a.source === "gapfill")).toBe(true);
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
