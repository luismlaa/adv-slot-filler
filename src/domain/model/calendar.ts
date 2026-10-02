import { z } from "zod";
import { idSchema, instantSchema } from "./primitives";

/** Conexión del calendario externo de un estilista (sync bidireccional). */
export const calendarLinkSchema = z.object({
  salonId: idSchema,
  staffId: idSchema,
  provider: z.enum(["google", "fake"]),
  calendarId: z.string().min(1),
  status: z.enum(["connected", "error", "disconnected"]),
  /** Token de sync incremental del proveedor. */
  syncToken: z.string().optional(),
  /** Canal de notificaciones push (webhook) activo. */
  channelId: z.string().optional(),
  channelResourceId: z.string().optional(),
  channelExpiresAt: instantSchema.optional(),
  /** Refresh token OAuth. Sensible: solo lo lee el servidor (RLS lo oculta al cliente). */
  refreshToken: z.string().optional(),
  connectedAt: instantSchema,
  lastSyncAt: instantSchema.optional(),
  lastError: z.string().optional(),
});
export type CalendarLink = z.infer<typeof calendarLinkSchema>;
