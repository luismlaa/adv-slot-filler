import { describe, expect, it } from "vitest";
import { PERSONAS } from "@/adapters/memory/seed";
import { DAY } from "@/domain/time";
import { cancelAppointment } from "@/services/booking";
import { handleInbound } from "@/services/conversation";
import { openGapForCancellation } from "@/services/gapfill";
import { tick } from "@/services/jobs";
import { buildTestApp, inbound } from "../../fixtures/app";

const lastOutTo = async (app: ReturnType<typeof buildTestApp>, phone: string) =>
  (await app.ctx.store.messages.list({ phone })).filter((m) => m.direction === "out").at(-1)?.text ?? "";

describe("guion de pitch de punta a punta", () => {
  const app = buildTestApp();
  const { ctx } = app;

  it("escena 1 — Pedro pide a Carlos el sábado: lleno → alternativas → elige → confirmado", async () => {
    const first = await handleInbound(ctx, inbound(PERSONAS.pedro.phone, "Klk, quiero corte con Carlos el sábado"));
    expect(first.replies[0]).toMatch(/Carlos está lleno el sábado/);
    expect(first.replies[0]).toMatch(/1️⃣/);

    const second = await handleInbound(ctx, inbound(PERSONAS.pedro.phone, "la 1"));
    expect(second.replies[0]).toMatch(/Listo ✅/);
    const pedroAppts = await ctx.store.appointments.list({ clientId: PERSONAS.pedro.id, statuses: ["booked"] });
    expect(pedroAppts).toHaveLength(1);
    expect(pedroAppts[0]).toMatchObject({ source: "whatsapp", serviceId: "svc-fade" });
  });

  it("escena 2 — Juan cancela el sábado: hueco → oferta a José → José acepta → hueco lleno", async () => {
    const cancelled = await cancelAppointment(ctx, app.seed.juanSaturdayAppointmentId, "Canceló desde el tablero");
    expect(cancelled?.status).toBe("cancelled");
    const gap = await openGapForCancellation(ctx, cancelled!);
    expect(gap?.wave).toBe(1);

    const offerText = await lastOutTo(app, PERSONAS.jose.phone);
    expect(offerText).toMatch(/Se liberó un espacio con Carlos/);

    const reply = await handleInbound(ctx, inbound(PERSONAS.jose.phone, "Sí!!"));
    expect(reply.replies[0]).toMatch(/Listo ✅/);
    const filled = await ctx.store.gaps.get(gap!.id);
    expect(filled).toMatchObject({ status: "filled" });
    const joseAppt = await ctx.store.appointments.get(filled!.filledByAppointmentId!);
    expect(joseAppt).toMatchObject({ clientId: PERSONAS.jose.id, source: "gapfill", start: cancelled!.start });
    expect((await ctx.store.waitlist.list()).find((w) => w.id === "wait-jose")?.status).toBe("fulfilled");

    const others = await ctx.store.offers.list({ gapId: gap!.id });
    expect(others.filter((o) => o.status === "pending")).toHaveLength(0);
  });

  it("primero gana: un segundo cliente que acepta tarde recibe 'ya lo tomó otra persona'", async () => {
    const gap = (await ctx.store.gaps.list(["filled"])).at(-1)!;
    const loser = (await ctx.store.offers.list({ gapId: gap.id })).find((o) => o.clientId !== PERSONAS.jose.id)!;
    const loserClient = (await ctx.store.clients.get(loser.clientId))!;
    const reply = await handleInbound(ctx, inbound(loserClient.phone, "si"));
    expect(reply.replies[0]).toMatch(/lo acaba de tomar otra persona/);
  });

  it("escena 3 — 4 semanas después, Pedro recibe 'ya van 4 semanas' y reserva con un 'sí'", async () => {
    const pedroVisit = (await ctx.store.appointments.list({ clientId: PERSONAS.pedro.id, statuses: ["booked"] }))[0]!;
    app.clock.set(Date.parse(pedroVisit.start) + 27 * DAY);
    const report = await tick(ctx);
    expect(report.completed).toBeGreaterThan(0);
    expect(report.reactivation.names).toContain("Pedro");

    const nudgeText = await lastOutTo(app, PERSONAS.pedro.phone);
    expect(nudgeText).toMatch(/Ya van 4 semanas de tu último fade/);

    const reply = await handleInbound(ctx, inbound(PERSONAS.pedro.phone, "sí, dale"));
    expect(reply.replies[0]).toMatch(/Listo ✅/);
    const nudge = (await ctx.store.nudges.list({ clientId: PERSONAS.pedro.id })).at(-1)!;
    expect(nudge.status).toBe("booked");
    const booked = await ctx.store.appointments.get(nudge.bookedAppointmentId!);
    expect(booked?.source).toBe("reactivation");

    const again = await tick(ctx);
    expect(again.reactivation.names).not.toContain("Pedro");
  });
});

describe("conversación — casos de borde", () => {
  it("responde lo del día a día: precios, horario y ubicación, sin perder el hilo", async () => {
    const app = buildTestApp();
    const price = await handleInbound(app.ctx, inbound(PERSONAS.ana.phone, "¿Cuánto cuesta el fade?"));
    expect(price.replies[0]).toMatch(/RD\$/);
    const hours = await handleInbound(app.ctx, inbound(PERSONAS.ana.phone, "¿A qué hora abren?"));
    expect(hours.replies[0]).toMatch(/Nuestro horario/);
    expect(hours.replies[0]).toMatch(/Lunes: cerrado/);
    const where = await handleInbound(app.ctx, inbound(PERSONAS.ana.phone, "¿dónde queda?"));
    expect(where.replies[0]).toMatch(/Piantini/);
  });

  it("cancelar pide confirmación y al confirmar abre el hueco", async () => {
    const app = buildTestApp();
    const ask = await handleInbound(app.ctx, inbound(PERSONAS.juan.phone, "no voy a poder ir el sábado"));
    expect(ask.replies[0]).toMatch(/¿Confirmas que cancelamos/);
    const done = await handleInbound(app.ctx, inbound(PERSONAS.juan.phone, "sí"));
    expect(done.replies[0]).toMatch(/cancelé tu cita/);
    expect(await app.ctx.store.gaps.list(["open"])).toHaveLength(1);
  });

  it("los webhooks duplicados no se procesan dos veces", async () => {
    const app = buildTestApp();
    const msg = inbound(PERSONAS.ana.phone, "hola");
    expect((await handleInbound(app.ctx, msg)).duplicate).toBe(false);
    expect((await handleInbound(app.ctx, msg)).duplicate).toBe(true);
  });

  it("BAJA silencia los mensajes proactivos pero no las respuestas", async () => {
    const app = buildTestApp();
    const reply = await handleInbound(app.ctx, inbound(PERSONAS.ana.phone, "BAJA"));
    expect(reply.replies[0]).toMatch(/no te enviaremos más avisos/);
    expect((await app.ctx.store.clients.get(PERSONAS.ana.id))?.optedOut).toBe(true);
    const run = await tick(app.ctx, { forceReactivation: true });
    expect(run.reactivation.names).not.toContain("Ana");
  });

  it("un número desconocido crea el cliente y recibe ayuda", async () => {
    const app = buildTestApp();
    const reply = await handleInbound(app.ctx, { ...inbound("+18295557777", "Hola"), profileName: "Miguelina" });
    expect(reply.replies[0]).toMatch(/Hola Miguelina/);
    expect(await app.ctx.store.clients.findByPhone("+18295557777")).toBeDefined();
  });

  it("'un corte' usa el servicio habitual del cliente (fade para Pedro)", async () => {
    const app = buildTestApp();
    const reply = await handleInbound(app.ctx, inbound(PERSONAS.pedro.phone, "quiero un corte mañana en la tarde"));
    expect(reply.replies[0]).toMatch(/fade/);
  });

  it("rechazar las alternativas ofrece lista de espera", async () => {
    const app = buildTestApp();
    await handleInbound(app.ctx, inbound(PERSONAS.pedro.phone, "quiero corte con Carlos el sábado"));
    const no = await handleInbound(app.ctx, inbound(PERSONAS.pedro.phone, "no"));
    expect(no.replies[0]).toMatch(/lista de espera/);
    const yes = await handleInbound(app.ctx, inbound(PERSONAS.pedro.phone, "sí"));
    expect(yes.replies[0]).toMatch(/te anoté en lista de espera con Carlos/);
  });
});
