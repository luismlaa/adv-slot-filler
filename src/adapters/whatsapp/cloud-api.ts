import { z } from "zod";
import type { Logger, MessagingChannel, OutboundMessage, SendResult } from "@/ports";

export interface WhatsAppConfig {
  readonly phoneNumberId: string;
  readonly accessToken: string;
  readonly apiVersion: string;
  readonly timeoutMs?: number;
  readonly maxRetries?: number;
  /** true = no envía nada; registra y devuelve un id ficticio. */
  readonly dryRun?: boolean;
}

const sendResponseSchema = z.object({ messages: z.array(z.object({ id: z.string() })).min(1) });

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Cuerpo de la Graph API: texto libre dentro de la ventana de 24 h, plantilla aprobada fuera de ella. */
export function buildSendBody(message: OutboundMessage): Record<string, unknown> {
  const to = message.to.replace(/^\+/, "");
  if (message.template) {
    return {
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: message.template.name,
        language: { code: message.template.language },
        components: [{ type: "body", parameters: message.template.params.map((text) => ({ type: "text", text })) }],
      },
    };
  }
  return { messaging_product: "whatsapp", to, type: "text", text: { body: message.text, preview_url: false } };
}

/**
 * WhatsApp Cloud API (Meta). Requiere verificación del negocio y plantillas aprobadas (fase D2).
 * Reintenta 429/5xx con backoff exponencial; cada intento tiene timeout.
 */
export function createWhatsAppChannel(config: WhatsAppConfig, logger: Logger, fetchImpl: typeof fetch = fetch): MessagingChannel {
  const url = `https://graph.facebook.com/${config.apiVersion}/${config.phoneNumberId}/messages`;
  const maxRetries = config.maxRetries ?? 3;

  return {
    name: "whatsapp",
    async send(message: OutboundMessage): Promise<SendResult> {
      const body = buildSendBody(message);
      if (config.dryRun) {
        logger.info("WhatsApp dry-run: mensaje no enviado", { to: message.to, purpose: message.purpose, template: message.template?.name });
        return { providerMessageId: `dry-${Date.now()}`, delivered: false };
      }
      let lastError = "";
      for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
        try {
          const response = await fetchImpl(url, {
            method: "POST",
            headers: { Authorization: `Bearer ${config.accessToken}`, "Content-Type": "application/json" },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(config.timeoutMs ?? 10_000),
          });
          if (response.ok) {
            const parsed = sendResponseSchema.parse(await response.json());
            return { providerMessageId: parsed.messages[0]!.id, delivered: true };
          }
          lastError = `HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`;
          const retryable = response.status === 429 || response.status >= 500;
          if (!retryable) break;
        } catch (error) {
          lastError = error instanceof Error ? error.message : String(error);
        }
        if (attempt < maxRetries) await sleep(2 ** attempt * 500);
      }
      logger.error("WhatsApp: no se pudo enviar el mensaje", { to: message.to, purpose: message.purpose, error: lastError });
      throw new Error(`WhatsApp: envío fallido (${lastError})`);
    },
  };
}
