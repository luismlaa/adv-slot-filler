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
