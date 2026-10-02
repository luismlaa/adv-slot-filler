import { describe, expect, it } from "vitest";
import { FakeCalendarProvider } from "@/adapters/calendar/fake";
import { PERSONAS } from "@/adapters/memory/seed";
import { allocate } from "@/domain/allocation";
import { addDaysToDate, toIso, zonedInstant } from "@/domain/time";
import { bookAppointment, cancelAppointment } from "@/services/booking";
import { createCalendarSync } from "@/services/calendar-sync";
import type { AppContext } from "@/services/context";
import { loadSnapshot } from "@/services/data";
import { buildTestApp } from "../../fixtures/app";

const TZ = "America/Santo_Domingo";

function setup() {
  const app = buildTestApp();
  const fake = new FakeCalendarProvider(() => app.clock.now());
  const sync = createCalendarSync(app.ctx, fake);
  const ctx: AppContext = { ...app.ctx, calendar: sync.hooks };
  const friday = addDaysToDate(app.seed.anchorDate, 1);
  return { ...app, ctx, fake, sync, friday };
}

describe("sync bidireccional de calendario", () => {
  it("las citas de Slot Filler aparecen en el calendario del estilista y se borran al cancelar", async () => {
    const { ctx, fake, sync, friday } = setup();
    await sync.connect("staff-carlos", "carlos@gmail.com");
    const snapshot = await loadSnapshot(ctx);
    const slot = allocate({ serviceId: "svc-fade", staffId: "staff-carlos", date: friday }, { snapshot, now: ctx.clock.now(), config: await ctx.config() }).matches[0]!;
    const booked = await bookAppointment(ctx, { clientId: PERSONAS.pedro.id, staffId: "staff-carlos", serviceId: "svc-fade", start: slot.start, source: "whatsapp" });
    expect(booked.ok).toBe(true);
    const visible = fake.visibleEvents("carlos@gmail.com", toIso(ctx.clock.now()), toIso(ctx.clock.now() + 7 * 86_400_000));
    expect(visible).toHaveLength(1);
    expect(visible[0]).toMatchObject({ slotFillerId: booked.ok ? booked.appointment.id : "", title: expect.stringMatching(/Fade.*Pedro/) });

    await cancelAppointment(ctx, booked.ok ? booked.appointment.id : "", "test");
    expect(fake.visibleEvents("carlos@gmail.com", toIso(ctx.clock.now()), toIso(ctx.clock.now() + 7 * 86_400_000))).toHaveLength(0);
  });

  it("un evento personal en Google bloquea ese tiempo y deja de ofrecerse", async () => {
    const { ctx, fake, sync, friday } = setup();
    await sync.connect("staff-carlos", "carlos@gmail.com");
    const before = await loadSnapshot(ctx);
    const config = await ctx.config();
    const free = allocate({ serviceId: "svc-fade", staffId: "staff-carlos", date: friday }, { snapshot: before, now: ctx.clock.now(), config }).matches[0]!;

    fake.addPersonalEvent("carlos@gmail.com", { title: "Cita médica", start: free.start, end: toIso(Date.parse(free.start) + 60 * 60_000) });
    const result = await sync.syncStaff("staff-carlos");
    expect(result.blocks).toBe(1);
    const blocks = await ctx.store.blocks.list({ staffId: "staff-carlos" });
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ title: "Cita médica", source: "calendar" });

    const after = await loadSnapshot(ctx);
    const exact = allocate({ serviceId: "svc-fade", staffId: "staff-carlos", date: friday, time: new Date(free.start).toLocaleTimeString("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }) }, { snapshot: after, now: ctx.clock.now(), config });
    expect(exact.status).toBe("alternatives");

    fake.removeEvent("carlos@gmail.com", blocks[0]!.externalEventId!);
    await sync.syncStaff("staff-carlos");
    expect(await ctx.store.blocks.list({ staffId: "staff-carlos" })).toHaveLength(0);
  });

  it("borrar en Google una cita de Slot Filler genera un aviso, no una cancelación", async () => {
    const { ctx, fake, sync, friday } = setup();
    await sync.connect("staff-carlos", "carlos@gmail.com");
    const start = toIso(zonedInstant(friday, "09:00", TZ));
    const free = allocate({ serviceId: "svc-fade", staffId: "staff-carlos", date: friday }, { snapshot: await loadSnapshot(ctx), now: ctx.clock.now(), config: await ctx.config() }).matches[0]!;
    const booked = await bookAppointment(ctx, { clientId: PERSONAS.pedro.id, staffId: "staff-carlos", serviceId: "svc-fade", start: free.start ?? start, source: "whatsapp" });
    if (!booked.ok) throw new Error("no se pudo reservar");
    const eventId = (await ctx.store.appointments.get(booked.appointment.id))!.externalEventId!;
    fake.removeEvent("carlos@gmail.com", eventId);
    const result = await sync.syncStaff("staff-carlos");
    expect(result.conflicts).toBe(1);
    expect((await ctx.store.appointments.get(booked.appointment.id))?.status).toBe("booked");
    expect((await ctx.store.activity.list(5)).some((a) => a.kind === "calendar.conflict")).toBe(true);
  });

  it("un evento personal que choca con citas ya reservadas bloquea y avisa", async () => {
    const { fake, sync, seed } = setup();
    await sync.connect("staff-carlos", "carlos@gmail.com");
    const saturday = addDaysToDate(seed.anchorDate, 2);
    fake.addPersonalEvent("carlos@gmail.com", { title: "Boda de mi primo", start: toIso(zonedInstant(saturday, "15:00", TZ)), end: toIso(zonedInstant(saturday, "19:00", TZ)) });
    const result = await sync.syncStaff("staff-carlos");
    expect(result.blocks).toBe(1);
    expect(result.conflicts).toBe(1);
  });

  it("un fallo del calendario no rompe la reserva: el enlace queda en error", async () => {
    const { ctx, sync, friday } = setup();
    await sync.connect("staff-carlos", "carlos@gmail.com");
    const broken = createCalendarSync(ctx, {
      name: "fake",
      listChanges: async () => ({ events: [], nextSyncToken: "1" }),
      upsertEvent: async () => {
        throw new Error("Google caído");
      },
      deleteEvent: async () => undefined,
      watch: async () => ({ channelId: "c", resourceId: "r", expiresAt: toIso(Date.now()) }),
    });
    const free = allocate({ serviceId: "svc-fade", staffId: "staff-carlos", date: friday }, { snapshot: await loadSnapshot(ctx), now: ctx.clock.now(), config: await ctx.config() }).matches[0]!;
    const booked = await bookAppointment({ ...ctx, calendar: broken.hooks }, { clientId: PERSONAS.pedro.id, staffId: "staff-carlos", serviceId: "svc-fade", start: free.start, source: "whatsapp" });
    expect(booked.ok).toBe(true);
    expect((await ctx.store.calendarLinks.get("staff-carlos"))).toMatchObject({ status: "error", lastError: "Google caído" });
  });
});
