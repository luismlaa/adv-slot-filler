import { type AllocationResult, allocate } from "@/domain/allocation";
import {
  type ConversationState,
  type CopyContext,
  IDLE,
  MESSAGES,
  type PendingRequest,
  alternativesMessage,
  availableMessage,
  cancelConfirmQuestion,
  cancelledMessage,
  confirmationMessage,
  formatDay,
  helpMessage,
  hoursMessage,
  locationMessage,
  pricesMessage,
  resolveChoice,
  restoreState,
} from "@/domain/conversation";
import type { Client, Message } from "@/domain/model";
import { normalizePhone } from "@/domain/text";
import { DAY, addDaysToDate, toIso, zonedInstant } from "@/domain/time";
import type { Interpretation, NluContext } from "@/nlu/types";
import type { InboundMessage } from "@/ports";
import { recordActivity } from "./activity";
import { bookAppointment, cancelAppointment, nextAppointmentOf } from "./booking";
import type { AppContext } from "./context";
import { copyContext, loadSnapshot, publish } from "./data";
import { acceptOffer, declineOffer, openGapForCancellation } from "./gapfill";
import { sendToClient } from "./notify";

export interface InboundResult {
  readonly duplicate: boolean;
  readonly replies: readonly string[];
  readonly interpretation?: Interpretation;
}

interface Turn {
  readonly ctx: AppContext;
  readonly client: Client;
  readonly copy: CopyContext;
  readonly interpretation: Interpretation;
  readonly state: ConversationState;
}

interface Outcome {
  readonly reply: string;
  readonly next: ConversationState;
}

/**
 * Punto de entrada de cada mensaje del cliente (webhook de WhatsApp o simulador).
 * Idempotente por id del proveedor; persiste el mensaje, interpreta, actúa, responde y guarda el estado.
 */
export async function handleInbound(ctx: AppContext, inbound: InboundMessage): Promise<InboundResult> {
  const phone = normalizePhone(inbound.from) ?? inbound.from;
  if (await ctx.store.messages.existsProviderId(inbound.providerMessageId)) return { duplicate: true, replies: [] };

  const now = ctx.clock.now();
  const client = (await ctx.store.clients.findByPhone(phone)) ?? (await createClient(ctx, phone, inbound.profileName));
  const message: Message = {
    id: ctx.ids.newId(),
    salonId: ctx.store.salonId,
    phone,
    clientId: client.id,
    direction: "in",
    text: inbound.text,
    purpose: "reply",
    providerMessageId: inbound.providerMessageId,
    at: toIso(now),
  };
  await ctx.store.messages.insert(message);
  publish(ctx, "message.in", { phone, messageId: message.id });

  const record = await ctx.store.conversations.get(phone);
  const state = restoreState(record?.state, record?.updatedAt, now);
  const copy = await copyContext(ctx);
  const interpretation = await ctx.nlu.interpret(inbound.text, { services: copy.services, staff: copy.staff, today: copy.today }, nluContext(state, copy));
  ctx.logger.debug("Mensaje interpretado", { salonId: ctx.store.salonId, clientId: client.id, intent: interpretation.intent, confidence: interpretation.confidence, source: interpretation.source });

  const outcome = await decide({ ctx, client, copy, interpretation, state });
  await ctx.store.conversations.save({ salonId: ctx.store.salonId, phone, state: outcome.next, updatedAt: toIso(ctx.clock.now()) });
  const fresh = (await ctx.store.clients.get(client.id)) ?? client;
  await sendToClient(ctx, fresh, outcome.reply, outcome.next.step === "idle" && /✅/.test(outcome.reply) ? "confirmation" : "reply");
  return { duplicate: false, replies: [outcome.reply], interpretation };
}

async function createClient(ctx: AppContext, phone: string, profileName: string | undefined): Promise<Client> {
  const client: Client = {
    id: ctx.ids.newId(),
    salonId: ctx.store.salonId,
    name: profileName?.trim() || "Cliente nuevo",
    phone,
    optedOut: false,
    createdAt: toIso(ctx.clock.now()),
  };
  await ctx.store.clients.insert(client);
  await recordActivity(ctx, "client.created", `Nuevo cliente por WhatsApp: ${client.name}`, { clientId: client.id });
  return client;
}

function nluContext(state: ConversationState, copy: CopyContext): NluContext {
  if (state.step === "choosing") {
    return {
      awaiting: state.purpose === "reactivation" ? "reactivation" : "choice",
      optionTimes: state.options.map((o) => new Date(o.start).toLocaleTimeString("en-GB", { timeZone: copy.timezone, hour: "2-digit", minute: "2-digit" })),
    };
  }
  if (state.step === "offer") return { awaiting: "offer" };
  if (state.step === "confirm_cancel") return { awaiting: "cancel_confirmation" };
  return {};
}

async function decide(turn: Turn): Promise<Outcome> {
  const { interpretation: it, state, client, ctx, copy } = turn;

  if (it.intent === "opt_out") {
    await ctx.store.clients.update(client.id, { optedOut: true });
    await recordActivity(ctx, "client.opted_out", `${client.name} pidió no recibir más avisos.`, { clientId: client.id });
    return { reply: MESSAGES.optedOut, next: IDLE };
  }
  if (it.intent === "opt_in") {
    await ctx.store.clients.update(client.id, { optedOut: false });
    return { reply: MESSAGES.optedIn, next: IDLE };
  }

  switch (state.step) {
    case "offer":
      if (it.intent === "affirm" || it.intent === "choose") return acceptOfferTurn(turn, state.offerId);
      if (it.intent === "deny") {
        await declineOffer(ctx, state.offerId);
        return { reply: MESSAGES.declined, next: IDLE };
      }
      break;
    case "confirm_cancel":
      if (it.intent === "affirm") return confirmCancel(turn, state.appointmentId);
      if (it.intent === "deny") return { reply: MESSAGES.keepAppointment, next: IDLE };
      break;
    case "choosing": {
      const picked = resolveChoice(state.options, it, copy.timezone, state.purpose === "reactivation");
      if (picked && (it.intent === "choose" || it.intent === "affirm" || it.intent === "book")) return bookOption(turn, state, picked);
      if (it.intent === "affirm") return { reply: MESSAGES.askWhich, next: state };
      if (it.intent === "deny") {
        if (state.nudgeId) await ctx.store.nudges.update(state.nudgeId, { status: "declined" });
        if (state.offeredWaitlist) return { reply: MESSAGES.askWaitlist, next: { step: "waitlist_prompt", request: state.request } };
        return { reply: MESSAGES.declined, next: IDLE };
      }
      if (it.intent === "waitlist") return joinWaitlist(turn, state.request);
      if (it.intent === "book" || it.intent === "availability") return searchSlots(turn, mergeRequest(state.request, it), state.purpose === "reschedule" ? state.rescheduleAppointmentId : undefined, state.nudgeId);
      break;
    }
    case "need_service":
      if (it.entities.serviceId) return searchSlots(turn, mergeRequest(state.request, it));
      break;
    case "waitlist_prompt":
      if (it.intent === "affirm" || it.intent === "waitlist") return joinWaitlist(turn, state.request);
      if (it.intent === "deny") return { reply: MESSAGES.declined, next: IDLE };
      break;
    case "idle":
      break;
  }

  switch (it.intent) {
    case "book":
    case "availability":
      return searchSlots(turn, mergeRequest({}, it));
    case "reschedule": {
      const appointment = await nextAppointmentOf(ctx, client.id);
      if (!appointment) return { reply: MESSAGES.noUpcoming, next: IDLE };
      return searchSlots(turn, mergeRequest({ serviceId: appointment.serviceId, staffId: appointment.staffId }, it), appointment.id);
    }
    case "cancel": {
      const appointment = await nextAppointmentOf(ctx, client.id);
      if (!appointment) return { reply: MESSAGES.noUpcoming, next: IDLE };
      return { reply: cancelConfirmQuestion(copy, appointment), next: { step: "confirm_cancel", appointmentId: appointment.id } };
    }
    case "waitlist":
      return joinWaitlist(turn, mergeRequest({}, it));
    case "thanks":
      return { reply: MESSAGES.thanks, next: IDLE };
    case "prices":
      return { reply: pricesMessage(copy, it.entities.serviceId), next: state };
    case "hours":
      return { reply: hoursMessage(copy), next: state };
    case "location":
      return { reply: locationMessage(copy), next: state };
    case "greeting":
    case "help":
      return { reply: helpMessage(copy, client.name), next: IDLE };
    case "affirm":
    case "deny":
    case "choose":
    case "unknown":
    default:
      return { reply: MESSAGES.unknown, next: state };
  }
}

function mergeRequest(base: PendingRequest, it: Interpretation): PendingRequest {
  const e = it.entities;
  const timing = e.date !== undefined || e.time !== undefined || e.window !== undefined;
  return {
    serviceId: e.serviceId ?? base.serviceId,
    staffId: e.anyStaff ? undefined : (e.staffId ?? base.staffId),
    date: e.date ?? base.date,
    time: timing ? e.time : base.time,
    window: timing ? e.window : base.window,
  };
}

/** El cliente dijo "un corte": usar su servicio habitual de esa categoría si lo tiene. */
async function resolveService(turn: Turn, request: PendingRequest): Promise<string | undefined> {
  const { ctx, client, copy, interpretation } = turn;
  const history = await ctx.store.appointments.list({ clientId: client.id, statuses: ["completed", "booked"] });
  const usual = (category?: string) => {
    const counts = new Map<string, number>();
    for (const a of history) {
      const service = copy.services.find((s) => s.id === a.serviceId);
      if (service && (category === undefined || service.category === category)) counts.set(service.id, (counts.get(service.id) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  };
  if (interpretation.entities.serviceCategory) return usual(interpretation.entities.serviceCategory) ?? request.serviceId;
  return request.serviceId ?? usual();
}

async function searchSlots(turn: Turn, request: PendingRequest, rescheduleAppointmentId?: string, nudgeId?: string): Promise<Outcome> {
  const { ctx, client, copy } = turn;
  const serviceId = await resolveService(turn, request);
  if (!serviceId) return { reply: MESSAGES.askService(copy), next: { step: "need_service", request } };
  const full: PendingRequest = { ...request, serviceId };
  const [snapshot, config] = await Promise.all([loadSnapshot(ctx), ctx.config()]);
  const result: AllocationResult = allocate(
    { serviceId, staffId: full.staffId, date: full.date, time: full.time, window: full.window, preferredStaffId: client.preferredStaffId },
    { snapshot, now: ctx.clock.now(), config },
  );
  const purpose: "reschedule" | "reactivation" | "booking" = rescheduleAppointmentId ? "reschedule" : nudgeId ? "reactivation" : "booking";
  const base = { step: "choosing" as const, purpose, request: full, rescheduleAppointmentId, nudgeId };

  if (result.status === "available") {
    const note = result.reason === "staff_lacks_specialty" ? alternativesMessage(copy, result.reason, full, []).split(" Te puedo")[0] : undefined;
    return { reply: availableMessage(copy, result.matches, note), next: { ...base, options: [...result.matches] } };
  }
  if (result.status === "alternatives") {
    return {
      reply: alternativesMessage(copy, result.reason, full, result.alternatives),
      next: { ...base, options: [...result.alternatives], offeredWaitlist: true },
    };
  }
  return { reply: MESSAGES.nothingAvailable, next: { step: "waitlist_prompt", request: full } };
}

async function bookOption(turn: Turn, state: Extract<ConversationState, { step: "choosing" }>, option: Extract<ConversationState, { step: "choosing" }>["options"][number]): Promise<Outcome> {
  const { ctx, client, copy } = turn;
  const source = state.purpose === "reactivation" ? "reactivation" : "whatsapp";
  const booking = await bookAppointment(ctx, { clientId: client.id, staffId: option.staffId, serviceId: option.serviceId, start: option.start, source });
  if (!booking.ok) {
    const retry = await searchSlots(turn, state.request, state.rescheduleAppointmentId, state.nudgeId);
    return { reply: `${MESSAGES.taken}\n\n${retry.reply}`, next: retry.next };
  }
  if (state.nudgeId) await ctx.store.nudges.update(state.nudgeId, { status: "booked", bookedAppointmentId: booking.appointment.id });
  if (state.rescheduleAppointmentId) {
    const old = await cancelAppointment(ctx, state.rescheduleAppointmentId, "El cliente la movió por WhatsApp");
    if (old) await openGapForCancellation(ctx, old);
  }
  return { reply: confirmationMessage(copy, booking.appointment), next: IDLE };
}

async function acceptOfferTurn(turn: Turn, offerId: string): Promise<Outcome> {
  const result = await acceptOffer(turn.ctx, offerId);
  if (result.ok) return { reply: confirmationMessage(turn.copy, result.appointment), next: IDLE };
  return { reply: result.reason === "expired" ? MESSAGES.offerExpired : MESSAGES.taken, next: IDLE };
}

async function confirmCancel(turn: Turn, appointmentId: string): Promise<Outcome> {
  const cancelled = await cancelAppointment(turn.ctx, appointmentId, "El cliente canceló por WhatsApp");
  if (!cancelled) return { reply: MESSAGES.noUpcoming, next: IDLE };
  await openGapForCancellation(turn.ctx, cancelled);
  return { reply: cancelledMessage(turn.copy, cancelled), next: IDLE };
}

async function joinWaitlist(turn: Turn, request: PendingRequest): Promise<Outcome> {
  const { ctx, client, copy } = turn;
  const serviceId = await resolveService(turn, request);
  if (!serviceId) return { reply: MESSAGES.askService(copy), next: { step: "need_service", request } };
  const now = ctx.clock.now();
  const windowStart = request.date ? zonedInstant(request.date, request.window?.from ?? "07:00", copy.timezone) : now;
  const windowEnd = request.date ? zonedInstant(request.date, request.window?.to ?? "21:00", copy.timezone) : now + 7 * DAY;
  await ctx.store.waitlist.insert({
    id: ctx.ids.newId(),
    salonId: ctx.store.salonId,
    clientId: client.id,
    serviceId,
    staffIds: request.staffId ? [request.staffId] : [],
    windowStart: toIso(Math.max(now, windowStart)),
    windowEnd: toIso(windowEnd),
    status: "active",
    createdAt: toIso(now),
  });
  publish(ctx, "waitlist.changed", { clientId: client.id });
  await recordActivity(ctx, "waitlist.joined", `${client.name} entró en lista de espera.`, { clientId: client.id, staffId: request.staffId });
  const day = request.date ? formatDay(request.date, copy.today) : `los próximos 7 días (hasta ${formatDay(addDaysToDate(copy.today, 7), copy.today)})`;
  return { reply: MESSAGES.waitlistJoined(copy, request.staffId, day), next: IDLE };
}
