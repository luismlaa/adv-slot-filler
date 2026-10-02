import type { Id } from "@/domain/model";

export type SalonRole = "owner" | "reception" | "staff";

export interface Membership {
  readonly salonId: Id;
  readonly role: SalonRole;
  readonly staffId: Id | undefined;
}

/**
 * Directorio de salones (multi-tenant): resuelve a qué salón pertenece cada entrada que no trae
 * sesión — un webhook de WhatsApp, un push de Google, un cron — y los salones de cada usuario.
 * Es la única pieza que consulta por encima de un salón; todo lo demás va por un `Store` acotado.
 */
export interface TenantDirectory {
  activeSalonIds(): Promise<Id[]>;
  salonForWhatsAppNumber(phoneNumberId: string): Promise<Id | undefined>;
  salonForCalendarChannel(channelId: string): Promise<Id | undefined>;
  membershipsOf(userId: string): Promise<Membership[]>;
  /** Comprobación barata de conectividad (healthcheck). */
  ping(): Promise<void>;
}
