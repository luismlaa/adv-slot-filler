import type { Client, Message } from "@/domain/model";
import { localParts, toIso } from "@/domain/time";
import type { TemplateRef } from "@/ports";
import type { AppContext } from "./context";
import { publish } from "./data";

/** Mensajes que el sistema inicia (no respuestas): sujetos a baja, horas de silencio y plantilla. */
const PROACTIVE: ReadonlySet<Message["purpose"]> = new Set(["offer", "reactivation", "reminder"]);

/** Plantillas a registrar en Meta (fase D2). Los parámetros se rellenan en orden. */
export const TEMPLATES = {
  offer: "slot_offer_v1",
  reactivation: "cycle_reminder_v1",
  reminder: "appointment_reminder_v1",
} as const;

const sentTimestamps: number[] = [];

export type SendOutcome = { readonly sent: true; readonly message: Message } | { readonly sent: false; readonly reason: "opted_out" | "quiet_hours" | "rate_limited" | "failed" };

export async function isQuietHours(ctx: AppContext, at: number = ctx.clock.now()): Promise<boolean> {
  const [config, salon] = await Promise.all([ctx.config(), ctx.store.salon.get()]);
  const hour = Math.floor(localParts(at, salon.timezone).minutesOfDay / 60);
  const { quietHoursStart: start, quietHoursEnd: end } = config.messaging;
  return start > end ? hour >= start || hour < end : hour >= start && hour < end;
}

/**
 * Envía un mensaje al cliente por el canal configurado y lo deja registrado.
 * Guardas en código (no en prompts): baja voluntaria, horas de silencio y límite por minuto
 * aplican a los mensajes proactivos; las respuestas a lo que el cliente escribió siempre salen.
 */
export async function sendToClient(
  ctx: AppContext,
  to: Pick<Client, "id" | "phone" | "optedOut"> | { id?: undefined; phone: string; optedOut?: boolean },
  text: string,
  purpose: Message["purpose"],
  template?: TemplateRef,
): Promise<SendOutcome> {
  const now = ctx.clock.now();
  const proactive = PROACTIVE.has(purpose);
  const log = ctx.logger.child({ salonId: ctx.store.salonId, clientId: to.id, purpose });
  if (proactive && to.optedOut) {
    log.info("Mensaje proactivo omitido: el cliente pidió baja");
    return { sent: false, reason: "opted_out" };
  }
  if (proactive && (await isQuietHours(ctx, now))) {
    log.info("Mensaje proactivo pospuesto: horas de silencio");
    return { sent: false, reason: "quiet_hours" };
  }
  if (proactive && ctx.messaging.name === "whatsapp") {
    // El límite protege la cuota de Meta; el simulador de la demo no lo necesita.
    const config = await ctx.config();
    const realNow = Date.now();
    while (sentTimestamps.length > 0 && realNow - sentTimestamps[0]! > 60_000) sentTimestamps.shift();
    if (sentTimestamps.length >= config.messaging.maxPerMinute) {
      log.warn("Mensaje proactivo frenado por límite de envíos por minuto");
      return { sent: false, reason: "rate_limited" };
    }
    sentTimestamps.push(realNow);
  }

  try {
    const result = await ctx.messaging.send({ to: to.phone, text, purpose, template: proactive ? template : undefined });
    const message: Message = {
      id: ctx.ids.newId(),
      salonId: ctx.store.salonId,
      phone: to.phone,
      clientId: to.id,
      direction: "out",
      text,
      purpose,
      providerMessageId: result.providerMessageId,
      at: toIso(now),
    };
    await ctx.store.messages.insert(message);
    publish(ctx, "message.out", { phone: to.phone, messageId: message.id, purpose });
    return { sent: true, message };
  } catch (error) {
    log.error("No se pudo enviar el mensaje", { error: error instanceof Error ? error.message : String(error) });
    return { sent: false, reason: "failed" };
  }
}
