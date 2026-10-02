import { z } from "zod";
import { idSchema, instantSchema, phoneSchema } from "./primitives";

export const messageSchema = z.object({
  id: idSchema,
  salonId: idSchema,
  phone: phoneSchema,
  clientId: idSchema.optional(),
  direction: z.enum(["in", "out"]),
  text: z.string(),
  /** Para qué se mandó: alimenta auditoría y métricas. */
  purpose: z.enum(["reply", "offer", "reactivation", "confirmation", "reminder", "system"]).default("reply"),
  /** Id del proveedor (wamid de WhatsApp) para idempotencia. */
  providerMessageId: z.string().optional(),
  at: instantSchema,
});
export type Message = z.infer<typeof messageSchema>;

/** Bitácora de negocio: qué decidió el sistema, sobre quién y por qué. Alimenta el feed en vivo y la auditoría. */
export const activitySchema = z.object({
  id: idSchema,
  salonId: idSchema,
  at: instantSchema,
  kind: z.string().min(1),
  severity: z.enum(["info", "success", "warning"]).default("info"),
  /** Texto en español para mostrar al salón. */
  message: z.string().min(1),
  clientId: idSchema.optional(),
  staffId: idSchema.optional(),
  appointmentId: idSchema.optional(),
  gapId: idSchema.optional(),
});
export type Activity = z.infer<typeof activitySchema>;

/** Estado de la conversación con un teléfono (JSON opaco validado por la máquina de diálogo). */
export const conversationRecordSchema = z.object({
  salonId: idSchema,
  phone: phoneSchema,
  state: z.unknown(),
  updatedAt: instantSchema,
});
export type ConversationRecord = z.infer<typeof conversationRecordSchema>;
