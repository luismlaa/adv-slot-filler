import { parseWebhook, verifyChallenge, verifySignature } from "@/adapters/whatsapp/webhook";
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

/** Mensajes entrantes. Se valida la firma antes de leer nada; los reintentos de Meta son idempotentes. */
export const POST = route(async (request: Request) => {
  const { env, ctx } = getContainer();
  if (!env.WHATSAPP_APP_SECRET) throw new HttpError(404, "WhatsApp no está configurado");
  const raw = await request.text();
  if (!verifySignature(raw, request.headers.get("x-hub-signature-256"), env.WHATSAPP_APP_SECRET)) throw new HttpError(401, "Firma inválida");
  const messages = parseWebhook(JSON.parse(raw));
  for (const message of messages) await handleInbound(ctx, message);
  return json({ received: messages.length });
});
