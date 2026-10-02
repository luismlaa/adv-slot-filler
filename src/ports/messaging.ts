import type { Message } from "@/domain/model";

/** Plantilla pre-aprobada (WhatsApp exige plantillas fuera de la ventana de 24 h). */
export interface TemplateRef {
  readonly name: string;
  readonly language: string;
  readonly params: readonly string[];
}

export interface OutboundMessage {
  readonly to: string;
  readonly text: string;
  readonly purpose: Message["purpose"];
  /** Si el canal lo exige (proactivo fuera de ventana), se manda la plantilla; `text` es el render local. */
  readonly template?: TemplateRef;
}

export interface SendResult {
  readonly providerMessageId: string;
  readonly delivered: boolean;
}

export interface InboundMessage {
  readonly from: string;
  readonly text: string;
  readonly providerMessageId: string;
  readonly profileName?: string;
  readonly at: string;
}

/** Canal hacia el cliente final: simulador en la demo, WhatsApp Cloud API en producción. */
export interface MessagingChannel {
  readonly name: "simulator" | "whatsapp";
  send(message: OutboundMessage): Promise<SendResult>;
}
