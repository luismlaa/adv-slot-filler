import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { InboundMessage } from "@/ports";

/** Handshake GET de Meta: devuelve el `hub.challenge` si el token coincide. */
export function verifyChallenge(params: URLSearchParams, verifyToken: string): string | undefined {
  const ok = params.get("hub.mode") === "subscribe" && params.get("hub.verify_token") === verifyToken;
  return ok ? (params.get("hub.challenge") ?? undefined) : undefined;
}

/** Valida `X-Hub-Signature-256` (HMAC-SHA256 del cuerpo crudo con el App Secret), en tiempo constante. */
export function verifySignature(rawBody: string, header: string | null, appSecret: string): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const expected = Buffer.from(createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex"));
  const received = Buffer.from(header.slice("sha256=".length));
  return expected.length === received.length && timingSafeEqual(expected, received);
}

const messageSchema = z.object({
  from: z.string(),
  id: z.string(),
  timestamp: z.string(),
  type: z.string(),
  text: z.object({ body: z.string() }).optional(),
  button: z.object({ text: z.string() }).optional(),
  interactive: z
    .object({
      button_reply: z.object({ title: z.string() }).optional(),
      list_reply: z.object({ title: z.string() }).optional(),
    })
    .optional(),
});

const webhookSchema = z.object({
  object: z.literal("whatsapp_business_account"),
  entry: z.array(
    z.object({
      changes: z.array(
        z.object({
          value: z.object({
            metadata: z.object({ phone_number_id: z.string() }).optional(),
            contacts: z.array(z.object({ wa_id: z.string(), profile: z.object({ name: z.string() }).optional() })).optional(),
            messages: z.array(messageSchema).optional(),
          }),
        }),
      ),
    }),
  ),
});

export interface InboundBatch {
  /** Número de WhatsApp Business que recibió los mensajes: identifica al salón. */
  readonly phoneNumberId: string | undefined;
  readonly messages: InboundMessage[];
}

/**
 * Extrae los mensajes entrantes de un webhook, agrupados por número del negocio (cada salón tiene
 * el suyo). Ignora estados (sent/delivered/read) y tipos sin texto (audio, imagen).
 */
export function parseWebhookBatches(payload: unknown): InboundBatch[] {
  const parsed = webhookSchema.safeParse(payload);
  if (!parsed.success) return [];
  return parsed.data.entry.flatMap((entry) =>
    entry.changes.map((change) => {
      const names = new Map((change.value.contacts ?? []).map((c) => [c.wa_id, c.profile?.name]));
      const messages = (change.value.messages ?? []).flatMap((m): InboundMessage[] => {
        const text = m.text?.body ?? m.button?.text ?? m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title;
        if (text === undefined) return [];
        return [
          {
            from: `+${m.from.replace(/^\+/, "")}`,
            text,
            providerMessageId: m.id,
            profileName: names.get(m.from),
            at: new Date(Number(m.timestamp) * 1000).toISOString(),
          },
        ];
      });
      return { phoneNumberId: change.value.metadata?.phone_number_id, messages };
    }),
  );
}

/** Todos los mensajes entrantes del webhook, sin importar el número que los recibió. */
export const parseWebhook = (payload: unknown): InboundMessage[] => parseWebhookBatches(payload).flatMap((b) => b.messages);
