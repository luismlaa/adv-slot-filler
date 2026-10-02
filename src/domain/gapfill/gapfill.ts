import type { BusinessConfig } from "@/config/business";
import type { ClientCycle } from "../cycles";
import { type Appointment, type Client, type Gap, type Id, type Offer, type WaitlistEntry, staffCanPerform } from "../model";
import { DAY, MINUTE, type ScheduleSnapshot, fromIso, isSlotFree, overlaps, toIso } from "../time";

export type GapfillParams = BusinessConfig["gapfill"];

/**
 * Al cancelarse una cita futura nace un hueco — salvo que falte tan poco
 * que nadie llegaría (`minNoticeMinutes`) o el relleno esté apagado.
 */
export function gapFromCancellation(cancelled: Appointment, now: number, params: GapfillParams, id: Id): Gap | undefined {
  if (params.mode === "off") return undefined;
  if (fromIso(cancelled.start) - now < params.minNoticeMinutes * MINUTE) return undefined;
  return {
    id,
    salonId: cancelled.salonId,
    staffId: cancelled.staffId,
    start: cancelled.start,
    end: cancelled.end,
    originAppointmentId: cancelled.id,
    status: "open",
    wave: 0,
    createdAt: toIso(now),
  };
}

export interface GapCandidate {
  readonly clientId: Id;
  readonly serviceId: Id;
  readonly source: "waitlist" | "cycle";
  readonly waitlistEntryId?: Id;
  readonly start: string;
  readonly end: string;
  readonly score: number;
}

export interface CandidateInput {
  readonly gap: Gap;
  readonly snapshot: ScheduleSnapshot;
  readonly waitlist: readonly WaitlistEntry[];
  readonly cycles: readonly ClientCycle[];
  readonly clients: readonly Client[];
  /** Todas las ofertas recientes del salón (para no repetir ni acosar). */
  readonly offers: readonly Offer[];
  readonly now: number;
  readonly params: GapfillParams;
}

/**
 * Quién puede ocupar el hueco, de mejor a peor:
 * 1. lista de espera compatible (servicio cabe, estilista aceptable, ventana cubre el hueco);
 * 2. clientes a los que su ciclo ya les toca, para un servicio que este estilista hace.
 */
export function rankCandidates(input: CandidateInput): GapCandidate[] {
  const { gap, snapshot, params, now } = input;
  const w = params.weights;
  const staff = snapshot.staff.find((s) => s.id === gap.staffId);
  if (!staff) return [];
  const gapStart = fromIso(gap.start);
  const gapEnd = fromIso(gap.end);
  const canceller = snapshot.appointments.find((a) => a.id === gap.originAppointmentId)?.clientId;
  const blocked = new Set(input.clients.filter((c) => c.optedOut).map((c) => c.id));
  if (canceller) blocked.add(canceller);
  for (const o of input.offers) {
    const recent = now - fromIso(o.sentAt) < params.recentOfferCooldownDays * DAY;
    if (o.gapId === gap.id || (recent && (o.status === "declined" || o.status === "expired"))) blocked.add(o.clientId);
  }

  const fit = (serviceId: Id, clientId: Id) => {
    const service = snapshot.services.find((s) => s.id === serviceId && s.active);
    if (!service || !staffCanPerform(staff, service)) return undefined;
    const end = gapStart + service.durationMinutes * MINUTE;
    const occupied = gapStart + (service.durationMinutes + service.bufferMinutes) * MINUTE;
    if (end > gapEnd || !isSlotFree(staff, { start: gapStart, end: occupied }, snapshot)) return undefined;
    const clientBusy = snapshot.appointments.some(
      (a) => a.clientId === clientId && a.status === "booked" && overlaps({ start: fromIso(a.start), end: fromIso(a.end) }, { start: gapStart, end }),
    );
    return clientBusy ? undefined : { start: toIso(gapStart), end: toIso(end) };
  };

  const fromWaitlist = input.waitlist
    .filter((e) => e.status === "active" && !blocked.has(e.clientId))
    .filter((e) => e.staffIds.length === 0 || e.staffIds.includes(staff.id))
    .flatMap((e): GapCandidate[] => {
      const slot = fit(e.serviceId, e.clientId);
      if (!slot || fromIso(e.windowStart) > gapStart || fromIso(e.windowEnd) < fromIso(slot.end)) return [];
      const ageDays = Math.max(0, (now - fromIso(e.createdAt)) / DAY);
      const score = w.waitlist + w.waitlistAgePerDay * ageDays + (e.staffIds.includes(staff.id) ? w.staffMatch : 0);
      return [{ clientId: e.clientId, serviceId: e.serviceId, source: "waitlist", waitlistEntryId: e.id, ...slot, score }];
    });

  const fromCycles = input.cycles
    .filter((c) => (c.status === "due" || c.status === "overdue" || c.status === "at_risk") && !blocked.has(c.clientId))
    .flatMap((c): GapCandidate[] => {
      const slot = fit(c.usualServiceId, c.clientId);
      if (!slot) return [];
      const urgency = c.status === "due" ? w.cycleDue : c.status === "overdue" ? w.cycleOverdue : w.cycleDue / 2;
      const score = urgency + (c.usualStaffId === staff.id ? w.staffMatch : 0) + c.confidence / 2;
      return [{ clientId: c.clientId, serviceId: c.usualServiceId, source: "cycle", ...slot, score }];
    });

  const best = new Map<Id, GapCandidate>();
  for (const c of [...fromWaitlist, ...fromCycles]) {
    const current = best.get(c.clientId);
    if (!current || c.score > current.score) best.set(c.clientId, c);
  }
  return [...best.values()].sort((a, b) => b.score - a.score).map((c) => ({ ...c, score: Math.round(c.score * 1000) / 1000 }));
}

export type GapAction =
  | { readonly kind: "wait" }
  | { readonly kind: "next_wave"; readonly wave: number }
  | { readonly kind: "expire"; readonly reason: "too_late" | "no_candidates" | "max_waves" };

/** Qué hacer con un hueco abierto ahora: esperar respuestas, lanzar otra ola o darlo por perdido. */
export function evaluateGap(gap: Gap, offers: readonly Offer[], candidatesLeft: number, now: number, params: GapfillParams): GapAction {
  if (gap.status !== "open") return { kind: "wait" };
  if (fromIso(gap.start) - now < params.minNoticeMinutes * MINUTE) return { kind: "expire", reason: "too_late" };
  const pending = offers.filter((o) => o.gapId === gap.id && o.status === "pending" && fromIso(o.expiresAt) > now);
  if (pending.length > 0) return { kind: "wait" };
  if (gap.wave >= params.maxWaves) return { kind: "expire", reason: "max_waves" };
  if (candidatesLeft === 0) return { kind: "expire", reason: "no_candidates" };
  return { kind: "next_wave", wave: gap.wave + 1 };
}

/** Borradores de oferta para una ola: los mejores `waveSize` candidatos, con vencimiento. */
export function buildWave(
  gap: Gap,
  candidates: readonly GapCandidate[],
  wave: number,
  now: number,
  params: GapfillParams,
  newId: () => Id,
): Offer[] {
  const ttl = params.offerTtlMinutes * MINUTE;
  // La oferta nunca vence después de que ya no daría tiempo de llegar.
  const expiresAt = Math.min(now + ttl, fromIso(gap.start) - params.minNoticeMinutes * MINUTE);
  return candidates.slice(0, params.waveSize).map((c) => ({
    id: newId(),
    salonId: gap.salonId,
    gapId: gap.id,
    clientId: c.clientId,
    serviceId: c.serviceId,
    staffId: gap.staffId,
    start: c.start,
    end: c.end,
    wave,
    source: c.source,
    waitlistEntryId: c.waitlistEntryId,
    score: c.score,
    status: "pending",
    sentAt: toIso(now),
    expiresAt: toIso(Math.max(expiresAt, now + MINUTE)),
  }));
}

export type AcceptCheck = { readonly ok: true } | { readonly ok: false; readonly reason: "not_pending" | "expired" | "gap_closed" };

/** Validación previa a aceptar; la garantía real de "primero gana" es el compare-and-set del puerto. */
export function checkAcceptance(offer: Offer, gap: Gap | undefined, now: number): AcceptCheck {
  if (offer.status !== "pending") return { ok: false, reason: "not_pending" };
  if (fromIso(offer.expiresAt) <= now) return { ok: false, reason: "expired" };
  if (!gap || gap.status !== "open") return { ok: false, reason: "gap_closed" };
  return { ok: true };
}

/** Ofertas pendientes cuyo tiempo ya pasó. */
export const expiredOffers = (offers: readonly Offer[], now: number): Offer[] =>
  offers.filter((o) => o.status === "pending" && fromIso(o.expiresAt) <= now);
