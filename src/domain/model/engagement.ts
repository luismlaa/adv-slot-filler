import { z } from "zod";
import { serviceCategorySchema } from "./catalog";
import { idSchema, instantSchema, localDateSchema } from "./primitives";

export const waitlistEntrySchema = z.object({
  id: idSchema,
  salonId: idSchema,
  clientId: idSchema,
  serviceId: idSchema,
  /** Estilistas aceptables; vacío = cualquiera con la especialidad. */
  staffIds: z.array(idSchema).default([]),
  /** Ventana en la que el cliente puede venir. */
  windowStart: instantSchema,
  windowEnd: instantSchema,
  status: z.enum(["active", "fulfilled", "expired", "cancelled"]),
  createdAt: instantSchema,
});
export type WaitlistEntry = z.infer<typeof waitlistEntrySchema>;

/** Tiempo liberado por una cancelación que el sistema intenta rellenar. */
export const gapSchema = z.object({
  id: idSchema,
  salonId: idSchema,
  staffId: idSchema,
  start: instantSchema,
  end: instantSchema,
  originAppointmentId: idSchema,
  status: z.enum(["open", "filled", "expired"]),
  wave: z.number().int().nonnegative(),
  createdAt: instantSchema,
  filledAt: instantSchema.optional(),
  filledByAppointmentId: idSchema.optional(),
});
export type Gap = z.infer<typeof gapSchema>;

export const offerSourceSchema = z.enum(["waitlist", "cycle"]);
export const offerStatusSchema = z.enum(["pending", "accepted", "declined", "expired", "superseded"]);
export type OfferStatus = z.infer<typeof offerStatusSchema>;

export const offerSchema = z.object({
  id: idSchema,
  salonId: idSchema,
  gapId: idSchema,
  clientId: idSchema,
  serviceId: idSchema,
  staffId: idSchema,
  start: instantSchema,
  end: instantSchema,
  wave: z.number().int().positive(),
  source: offerSourceSchema,
  waitlistEntryId: idSchema.optional(),
  score: z.number(),
  status: offerStatusSchema,
  sentAt: instantSchema,
  expiresAt: instantSchema,
  respondedAt: instantSchema.optional(),
});
export type Offer = z.infer<typeof offerSchema>;

/** Invitación proactiva "ya te toca" enviada según el ciclo del cliente. */
export const nudgeSchema = z.object({
  id: idSchema,
  salonId: idSchema,
  clientId: idSchema,
  category: serviceCategorySchema,
  serviceId: idSchema,
  dueDate: localDateSchema,
  /** Última visita que originó este ciclo — una invitación por ciclo. */
  lastVisitAppointmentId: idSchema,
  status: z.enum(["sent", "booked", "declined", "ignored"]),
  sentAt: instantSchema,
  bookedAppointmentId: idSchema.optional(),
});
export type Nudge = z.infer<typeof nudgeSchema>;
