import { endSentence, firstNameOf, formatWhen, offerMessage } from "@/domain/conversation";
import { buildWave, checkAcceptance, evaluateGap, expiredOffers, gapFromCancellation, rankCandidates } from "@/domain/gapfill";
import type { Appointment, Gap, Id, Offer } from "@/domain/model";
import { MINUTE, fromIso, localDateOf, toIso } from "@/domain/time";
import { recordActivity } from "./activity";
import { bookAppointment } from "./booking";
import type { AppContext } from "./context";
import { copyContext, loadCycles, loadSnapshot, publish } from "./data";
import { TEMPLATES, isQuietHours, sendToClient } from "./notify";

const RECENT_OFFERS_DAYS = 14;

/** Tras una cancelación: abre el hueco (una sola vez por cita) y lanza la primera ola de ofertas. */
export async function openGapForCancellation(ctx: AppContext, cancelled: Appointment): Promise<Gap | undefined> {
  const config = await ctx.config();
  const gap = gapFromCancellation(cancelled, ctx.clock.now(), config.gapfill, ctx.ids.newId());
  if (!gap) return undefined;
  const existing = await ctx.store.gaps.list();
  if (existing.some((g) => g.originAppointmentId === cancelled.id)) return undefined;
  await ctx.store.gaps.insert(gap);
  const [staff, salon] = await Promise.all([ctx.store.staff.list(), ctx.store.salon.get()]);
  publish(ctx, "gap.opened", { gapId: gap.id, staffId: gap.staffId });
  await recordActivity(
    ctx,
    "gap.opened",
    `${endSentence(`Se liberó un hueco con ${firstNameOf(staff.find((s) => s.id === gap.staffId)?.name ?? "")} ${formatWhen(gap.start, salon.timezone, localDateOf(ctx.clock.now(), salon.timezone))}`)} Buscando quién lo ocupe…`,
    { staffId: gap.staffId, gapId: gap.id, appointmentId: cancelled.id },
  );
  await runGap(ctx, gap.id);
  return (await ctx.store.gaps.get(gap.id)) ?? gap;
}

/** Avanza un hueco abierto: espera, lanza la siguiente ola o lo da por perdido. Idempotente. */
export async function runGap(ctx: AppContext, gapId: Id): Promise<void> {
  const gap = await ctx.store.gaps.get(gapId);
  if (!gap || gap.status !== "open") return;
  const config = await ctx.config();
  const now = ctx.clock.now();
  const [snapshot, waitlist, cycles, clients, offers] = await Promise.all([
    loadSnapshot(ctx),
    ctx.store.waitlist.list(["active"]),
    loadCycles(ctx),
    ctx.store.clients.list(),
    ctx.store.offers.list({ sentAfter: toIso(now - RECENT_OFFERS_DAYS * 86_400_000) }),
  ]);
  const candidates = rankCandidates({ gap, snapshot, waitlist, cycles, clients, offers, now, params: config.gapfill });
  const action = evaluateGap(gap, offers, candidates.length, now, config.gapfill);

  if (action.kind === "wait") return;
  if (action.kind === "expire") {
    await expireGap(ctx, gap, action.reason);
    return;
  }
  if (await isQuietHours(ctx, now)) return; // se reintenta en el próximo tick, al terminar las horas de silencio

  const drafts = buildWave(gap, candidates, action.wave, now, config.gapfill, () => ctx.ids.newId());
  const inserted = await ctx.store.offers.insertMany(drafts);
  await ctx.store.gaps.transition(gap.id, "open", { wave: action.wave });
  const copy = await copyContext(ctx);
  const reached: string[] = [];
  for (const offer of inserted) {
    const client = clients.find((c) => c.id === offer.clientId);
    if (!client) continue;
    const text = offerMessage(copy, client.name, offer, config.gapfill.offerTtlMinutes);
    const staffName = firstNameOf(copy.staff.find((s) => s.id === offer.staffId)?.name ?? "");
    const outcome = await sendToClient(ctx, client, text, "offer", {
      name: TEMPLATES.offer,
      language: "es",
      params: [firstNameOf(client.name), staffName, formatWhen(offer.start, copy.timezone, copy.today), String(config.gapfill.offerTtlMinutes)],
    });
    if (!outcome.sent) {
      await ctx.store.offers.transition(offer.id, "pending", { status: "expired" });
      continue;
    }
    reached.push(firstNameOf(client.name));
    await ctx.store.conversations.save({ salonId: ctx.store.salonId, phone: client.phone, state: { step: "offer", offerId: offer.id }, updatedAt: toIso(now) });
    publish(ctx, "offer.sent", { offerId: offer.id, gapId: gap.id, clientId: client.id });
  }
  if (reached.length > 0) {
    await recordActivity(
      ctx,
      "gap.wave",
      `Ola ${action.wave}: oferta enviada a ${reached.join(", ")} (vence en ${config.gapfill.offerTtlMinutes} min)`,
      { staffId: gap.staffId, gapId: gap.id },
    );
  }
}

async function expireGap(ctx: AppContext, gap: Gap, reason: "too_late" | "no_candidates" | "max_waves"): Promise<void> {
  const expired = await ctx.store.gaps.transition(gap.id, "open", { status: "expired" });
  if (!expired) return;
  for (const o of await ctx.store.offers.list({ gapId: gap.id, statuses: ["pending"] })) {
    await ctx.store.offers.transition(o.id, "pending", { status: "superseded" });
  }
  publish(ctx, "gap.expired", { gapId: gap.id });
  const why = { too_late: "ya no da tiempo de avisar", no_candidates: "no hay clientes compatibles", max_waves: "nadie aceptó tras varias olas" }[reason];
  await recordActivity(ctx, "gap.expired", `El hueco quedó libre: ${why}.`, { staffId: gap.staffId, gapId: gap.id }, "warning");
}

export type AcceptResult =
  | { readonly ok: true; readonly appointment: Appointment; readonly offer: Offer }
  | { readonly ok: false; readonly reason: "not_found" | "not_pending" | "expired" | "gap_closed" | "unavailable" };

/**
 * El cliente acepta la oferta. "Primero gana" en tres compare-and-set encadenados:
 * oferta pending→accepted, hueco open→filled, inserción de la cita sin solapes.
 */
export async function acceptOffer(ctx: AppContext, offerId: Id): Promise<AcceptResult> {
  const now = ctx.clock.now();
  const offer = await ctx.store.offers.get(offerId);
  if (!offer) return { ok: false, reason: "not_found" };
  const gap = await ctx.store.gaps.get(offer.gapId);
  const check = checkAcceptance(offer, gap, now);
  if (!check.ok) {
    if (check.reason === "expired") await ctx.store.offers.transition(offer.id, "pending", { status: "expired" });
    if (check.reason === "gap_closed") await ctx.store.offers.transition(offer.id, "pending", { status: "superseded" });
    return { ok: false, reason: check.reason };
  }
  const claimed = await ctx.store.offers.transition(offer.id, "pending", { status: "accepted", respondedAt: toIso(now) });
  if (!claimed) return { ok: false, reason: "not_pending" };
  const filled = await ctx.store.gaps.transition(offer.gapId, "open", { status: "filled", filledAt: toIso(now) });
  if (!filled) {
    await ctx.store.offers.transition(offer.id, "accepted", { status: "superseded" });
    return { ok: false, reason: "gap_closed" };
  }
  const booking = await bookAppointment(ctx, { clientId: offer.clientId, staffId: offer.staffId, serviceId: offer.serviceId, start: offer.start, source: "gapfill", gapId: offer.gapId });
  if (!booking.ok) {
    await ctx.store.gaps.transition(offer.gapId, "filled", { status: "open" });
    await ctx.store.offers.transition(offer.id, "accepted", { status: "superseded" });
    return { ok: false, reason: "unavailable" };
  }
  await ctx.store.gaps.transition(offer.gapId, "filled", { filledByAppointmentId: booking.appointment.id });
  for (const other of await ctx.store.offers.list({ gapId: offer.gapId, statuses: ["pending"] })) {
    await ctx.store.offers.transition(other.id, "pending", { status: "superseded" });
  }
  if (offer.waitlistEntryId) await ctx.store.waitlist.update(offer.waitlistEntryId, { status: "fulfilled" });

  const client = await ctx.store.clients.get(offer.clientId);
  const minutes = Math.max(1, Math.round((now - fromIso(gap!.createdAt)) / MINUTE));
  publish(ctx, "offer.accepted", { offerId, gapId: offer.gapId });
  publish(ctx, "gap.filled", { gapId: offer.gapId, appointmentId: booking.appointment.id });
  await recordActivity(
    ctx,
    "gap.filled",
    `Hueco rellenado en ${minutes} min: ${firstNameOf(client?.name ?? "Cliente")} tomó el espacio (${offer.source === "waitlist" ? "lista de espera" : "le tocaba volver"}).`,
    { clientId: offer.clientId, staffId: offer.staffId, appointmentId: booking.appointment.id, gapId: offer.gapId },
    "success",
  );
  return { ok: true, appointment: booking.appointment, offer: claimed };
}

/** El cliente rechaza: si ya no quedan ofertas vivas, sale la siguiente ola de inmediato. */
export async function declineOffer(ctx: AppContext, offerId: Id): Promise<void> {
  const declined = await ctx.store.offers.transition(offerId, "pending", { status: "declined", respondedAt: toIso(ctx.clock.now()) });
  if (!declined) return;
  publish(ctx, "offer.declined", { offerId, gapId: declined.gapId });
  await runGap(ctx, declined.gapId);
}

/** Tick periódico: vence ofertas y hace avanzar todos los huecos abiertos. */
export async function tickGaps(ctx: AppContext): Promise<void> {
  const now = ctx.clock.now();
  for (const offer of expiredOffers(await ctx.store.offers.list({ statuses: ["pending"] }), now)) {
    if (await ctx.store.offers.transition(offer.id, "pending", { status: "expired" })) publish(ctx, "offer.expired", { offerId: offer.id });
  }
  for (const gap of await ctx.store.gaps.list(["open"])) await runGap(ctx, gap.id);
}
