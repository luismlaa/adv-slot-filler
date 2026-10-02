import { z } from "zod";
import { localDateSchema, localTimeSchema } from "../model";

export const slotOptionSchema = z.object({
  staffId: z.string(),
  serviceId: z.string(),
  start: z.iso.datetime(),
  end: z.iso.datetime(),
  kind: z.enum(["match", "same_staff_other_time", "other_staff_same_day", "other_staff_other_day", "other_time"]),
  score: z.number(),
});

/** Lo que el cliente viene pidiendo (se completa a lo largo de varios mensajes). */
export const pendingRequestSchema = z.object({
  serviceId: z.string().optional(),
  staffId: z.string().optional(),
  date: localDateSchema.optional(),
  time: localTimeSchema.optional(),
  window: z.object({ from: localTimeSchema, to: localTimeSchema }).optional(),
});
export type PendingRequest = z.infer<typeof pendingRequestSchema>;

/** Estado de la conversación por teléfono. Se persiste como JSON y se valida al leerlo. */
export const conversationStateSchema = z.discriminatedUnion("step", [
  z.object({ step: z.literal("idle") }),
  z.object({
    step: z.literal("choosing"),
    purpose: z.enum(["booking", "reactivation", "reschedule"]),
    options: z.array(slotOptionSchema).min(1),
    request: pendingRequestSchema,
    nudgeId: z.string().optional(),
    rescheduleAppointmentId: z.string().optional(),
    /** Si no quedó nada, se ofreció anotarlo en lista de espera. */
    offeredWaitlist: z.boolean().optional(),
  }),
  z.object({ step: z.literal("need_service"), request: pendingRequestSchema }),
  z.object({ step: z.literal("waitlist_prompt"), request: pendingRequestSchema }),
  z.object({ step: z.literal("confirm_cancel"), appointmentId: z.string() }),
  z.object({ step: z.literal("offer"), offerId: z.string() }),
]);
export type ConversationState = z.infer<typeof conversationStateSchema>;

export const IDLE: ConversationState = { step: "idle" };

/** Lee el estado guardado; si está corrupto o viejo (> 24 h), arranca de cero. */
export function restoreState(raw: unknown, updatedAt: string | undefined, now: number): ConversationState {
  if (updatedAt === undefined || now - Date.parse(updatedAt) > 24 * 3_600_000) return IDLE;
  const parsed = conversationStateSchema.safeParse(raw);
  return parsed.success ? parsed.data : IDLE;
}
