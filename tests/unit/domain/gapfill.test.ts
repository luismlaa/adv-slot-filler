import { describe, expect, it } from "vitest";
import { type ClientCycle } from "@/domain/cycles";
import { buildWave, checkAcceptance, evaluateGap, expiredOffers, gapFromCancellation, rankCandidates } from "@/domain/gapfill";
import type { Client, Offer, WaitlistEntry } from "@/domain/model";
import { MINUTE, toIso, zonedInstant } from "@/domain/time";
import { NOW, SALON, SATURDAY, TZ, appointment, config, snapshot } from "../../fixtures/salon";

const params = config.gapfill;
const cancelled = appointment("carlos", SATURDAY, "15:00", 45, { clientId: "cancela", status: "cancelled" });
const gap = gapFromCancellation(cancelled, NOW, params, "gap-1")!;
const at = (time: string) => toIso(zonedInstant(SATURDAY, time, TZ));
const client = (id: string, optedOut = false): Client => ({ id, salonId: SALON, name: id, phone: "+18095550000", optedOut, createdAt: toIso(NOW) });
const waitlist = (id: string, clientId: string, extra: Partial<WaitlistEntry> = {}): WaitlistEntry => ({
  id,
  salonId: SALON,
  clientId,
  serviceId: "fade",
  staffIds: [],
  windowStart: at("09:00"),
  windowEnd: at("19:00"),
  status: "active",
  createdAt: toIso(NOW - 2 * 86_400_000),
  ...extra,
});
const cycle = (clientId: string, extra: Partial<ClientCycle> = {}): ClientCycle => ({
  clientId,
  category: "corte",
  visits: 6,
  expectedDays: 21,
  confidence: 0.8,
  source: "history",
  lastVisitDate: "2026-09-10",
  lastVisitAppointmentId: `last-${clientId}`,
  dueDate: "2026-10-01",
  daysSinceLast: 21,
  daysUntilDue: 0,
  status: "due",
  usualServiceId: "fade",
  usualStaffId: "carlos",
  ...extra,
});
const input = (parts: Partial<Parameters<typeof rankCandidates>[0]> = {}) => ({
  gap,
  snapshot: snapshot({ appointments: [cancelled] }),
  waitlist: [],
  cycles: [],
  clients: [],
  offers: [],
  now: NOW,
  params,
  ...parts,
});

describe("gapFromCancellation", () => {
  it("crea un hueco con el tiempo de la cita cancelada", () => {
    expect(gap).toMatchObject({ staffId: "carlos", start: cancelled.start, end: cancelled.end, status: "open", wave: 0 });
  });

  it("no crea hueco si falta muy poco o el relleno está apagado", () => {
    const soon = appointment("carlos", "2026-10-01", "10:30", 45, { status: "cancelled" });
    expect(gapFromCancellation(soon, NOW, params, "g")).toBeUndefined();
    expect(gapFromCancellation(cancelled, NOW, { ...params, mode: "off" }, "g")).toBeUndefined();
  });
});

describe("rankCandidates", () => {
  it("la lista de espera va antes que los clientes por ciclo", () => {
    const ranked = rankCandidates(input({ waitlist: [waitlist("w1", "maria")], cycles: [cycle("pedro")] }));
    expect(ranked.map((c) => c.clientId)).toEqual(["maria", "pedro"]);
    expect(ranked[0]).toMatchObject({ source: "waitlist", waitlistEntryId: "w1", start: cancelled.start });
  });

  it("excluye a quien canceló, a quien pidió baja y a quien ya recibió oferta de este hueco", () => {
    const offered: Offer = {
      ...buildWave(gap, [{ clientId: "jose", serviceId: "fade", source: "cycle", start: gap.start, end: gap.end, score: 1 }], 1, NOW, params, () => "o1")[0]!,
    };
    const ranked = rankCandidates(
      input({
        waitlist: [waitlist("w1", "cancela"), waitlist("w2", "baja")],
        cycles: [cycle("jose"), cycle("pedro")],
        clients: [client("baja", true)],
        offers: [offered],
      }),
    );
    expect(ranked.map((c) => c.clientId)).toEqual(["pedro"]);
  });

  it("respeta la ventana y el estilista aceptable de la lista de espera", () => {
    const ranked = rankCandidates(
      input({
        waitlist: [
          waitlist("w-morning", "a", { windowEnd: at("12:00") }),
          waitlist("w-luis", "b", { staffIds: ["luis"] }),
          waitlist("w-ok", "c", { staffIds: ["carlos"] }),
        ],
      }),
    );
    expect(ranked.map((c) => c.clientId)).toEqual(["c"]);
  });

  it("el servicio debe caber en el hueco y el estilista debe tener la especialidad", () => {
    const ranked = rankCandidates(
      input({
        waitlist: [waitlist("w-color", "a", { serviceId: "color" }), waitlist("w-barba", "b", { serviceId: "barba" })],
        cycles: [cycle("c", { usualServiceId: "clasico" })],
      }),
    );
    expect(ranked.map((c) => c.clientId)).toEqual(["c"]);
  });

  it("no ofrece si el hueco ya se ocupó", () => {
    const taken = appointment("carlos", SATURDAY, "15:00", 45, { clientId: "otro" });
    expect(rankCandidates(input({ snapshot: snapshot({ appointments: [cancelled, taken] }), cycles: [cycle("pedro")] }))).toEqual([]);
  });

  it("vencidos pesan más que 'por volver', y el estilista habitual suma", () => {
    const ranked = rankCandidates(
      input({
        cycles: [cycle("due-other", { usualStaffId: "luis" }), cycle("overdue", { status: "overdue" }), cycle("due-same")],
      }),
    );
    expect(ranked.map((c) => c.clientId)).toEqual(["overdue", "due-same", "due-other"]);
  });

  it("no ofrece a quien ya tiene otra cita a esa hora", () => {
    const busy = appointment("luis", SATURDAY, "15:00", 45, { clientId: "pedro" });
    expect(rankCandidates(input({ snapshot: snapshot({ appointments: [cancelled, busy] }), cycles: [cycle("pedro")] }))).toEqual([]);
  });
});

describe("olas y aceptación", () => {
  const candidates = ["a", "b", "c", "d"].map((id, i) => ({
    clientId: id,
    serviceId: "fade",
    source: "cycle" as const,
    start: gap.start,
    end: gap.end,
    score: 10 - i,
  }));
  let n = 0;
  const wave = buildWave(gap, candidates, 1, NOW, params, () => `offer-${++n}`);

  it("una ola manda `waveSize` ofertas con vencimiento", () => {
    expect(wave).toHaveLength(params.waveSize);
    expect(wave.map((o) => o.clientId)).toEqual(["a", "b", "c"]);
    expect(Date.parse(wave[0]!.expiresAt) - NOW).toBe(params.offerTtlMinutes * MINUTE);
  });

  it("espera mientras haya ofertas vivas; luego lanza la siguiente ola", () => {
    const openGap = { ...gap, wave: 1 };
    expect(evaluateGap(openGap, wave, 1, NOW, params)).toEqual({ kind: "wait" });
    const later = NOW + (params.offerTtlMinutes + 1) * MINUTE;
    expect(expiredOffers(wave, later)).toHaveLength(3);
    const expired = wave.map((o) => ({ ...o, status: "expired" as const }));
    expect(evaluateGap(openGap, expired, 1, later, params)).toEqual({ kind: "next_wave", wave: 2 });
    expect(evaluateGap(openGap, expired, 0, later, params)).toEqual({ kind: "expire", reason: "no_candidates" });
    expect(evaluateGap({ ...gap, wave: params.maxWaves }, expired, 5, later, params)).toEqual({ kind: "expire", reason: "max_waves" });
  });

  it("primero gana: una oferta solo se acepta si sigue pendiente, vigente y el hueco abierto", () => {
    const offer = wave[0]!;
    expect(checkAcceptance(offer, gap, NOW + MINUTE)).toEqual({ ok: true });
    expect(checkAcceptance(offer, { ...gap, status: "filled" }, NOW + MINUTE)).toEqual({ ok: false, reason: "gap_closed" });
    expect(checkAcceptance(offer, gap, Date.parse(offer.expiresAt))).toEqual({ ok: false, reason: "expired" });
    expect(checkAcceptance({ ...offer, status: "superseded" }, gap, NOW)).toEqual({ ok: false, reason: "not_pending" });
  });

  it("la oferta vence antes de que ya no dé tiempo de llegar", () => {
    const soonGap = { ...gap, start: toIso(NOW + 70 * MINUTE) };
    const [offer] = buildWave(soonGap, candidates, 1, NOW, params, () => "x");
    expect(Date.parse(offer!.expiresAt)).toBeLessThanOrEqual(Date.parse(soonGap.start) - params.minNoticeMinutes * MINUTE);
  });
});
