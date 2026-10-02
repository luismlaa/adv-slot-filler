import { parseWebhookBatches, verifyChallenge, verifySignature } from "@/adapters/whatsapp/webhook";
import { getContainer } from "@/lib/container";
import { HttpError, json, route } from "@/lib/http";
import { handleInbound } from "@/services/conversation";

export const dynamic = "force-dynamic";

/** Verificación del webhook al registrarlo en Meta. */
export const GET = route(async (request: Request) => {
  const { env } = getContainer();
  if (!env.WHATSAPP_VERIFY_TOKEN) throw new HttpError(404, "WhatsApp no está configurado");
  const challenge = verifyChallenge(new URL(request.url).searchParams, env.WHATSAPP_VERIFY_TOKEN);
  if (!challenge) throw new HttpError(403, "Token de verificación inválido");
  return new Response(challenge, { status: 200 });
});

/**
 * Mensajes entrantes. Se valida la firma antes de leer nada; los reintentos de Meta son idempotentes.
 * Cada lote llega a un número de WhatsApp Business, y ese número identifica al salón.
 */
export const POST = route(async (request: Request) => {
  const { env, directory, forSalon, logger } = getContainer();
  if (!env.WHATSAPP_APP_SECRET) throw new HttpError(404, "WhatsApp no está configurado");
  const raw = await request.text();
  if (!verifySignature(raw, request.headers.get("x-hub-signature-256"), env.WHATSAPP_APP_SECRET)) throw new HttpError(401, "Firma inválida");
  let received = 0;
  for (const batch of parseWebhookBatches(JSON.parse(raw))) {
    if (batch.messages.length === 0) continue;
    const salonId = batch.phoneNumberId ? await directory.salonForWhatsAppNumber(batch.phoneNumberId) : undefined;
    if (!salonId) {
      // 200 igual: si respondemos error, Meta reintenta para siempre un número que no es nuestro.
      logger.warn("Mensaje para un número de WhatsApp sin salón asignado", { phoneNumberId: batch.phoneNumberId, count: batch.messages.length });
      continue;
    }
    const { ctx } = await forSalon(salonId);
    for (const message of batch.messages) await handleInbound(ctx, message);
    received += batch.messages.length;
  }
  return json({ received });
});
