import { z } from "zod";
import { idSchema, instantSchema } from "./primitives";

export const appointmentStatusSchema = z.enum(["booked", "completed", "cancelled", "no_show"]);
export type AppointmentStatus = z.infer<typeof appointmentStatusSchema>;

/** Por dónde entró la cita — alimenta las métricas de ROI. */
export const appointmentSourceSchema = z.enum(["whatsapp", "salon", "gapfill", "reactivation", "walkin", "import"]);
export type AppointmentSource = z.infer<typeof appointmentSourceSchema>;

export const appointmentSchema = z
  .object({
    id: idSchema,
    salonId: idSchema,
    clientId: idSchema,
    staffId: idSchema,
    serviceId: idSchema,
    start: instantSchema,
    end: instantSchema,
    status: appointmentStatusSchema,
    source: appointmentSourceSchema,
    price: z.number().nonnegative(),
    createdAt: instantSchema,
    cancelledAt: instantSchema.optional(),
    cancelReason: z.string().optional(),
    /** Hueco que esta cita rellenó (si vino de una oferta). */
    gapId: idSchema.optional(),
    /** Id del evento espejo en el calendario externo del estilista. */
    externalEventId: z.string().optional(),
  })
  .refine((a) => a.start < a.end, "La cita debe terminar después de empezar");
export type Appointment = z.infer<typeof appointmentSchema>;

export const blockSourceSchema = z.enum(["manual", "calendar"]);

/** Tiempo no reservable de un estilista: descanso puntual, diligencia o evento personal de su calendario. */
export const blockSchema = z
  .object({
    id: idSchema,
    salonId: idSchema,
    staffId: idSchema,
    start: instantSchema,
    end: instantSchema,
    title: z.string().min(1),
    source: blockSourceSchema,
    externalEventId: z.string().optional(),
    createdAt: instantSchema,
  })
  .refine((b) => b.start < b.end, "El bloqueo debe terminar después de empezar");
export type Block = z.infer<typeof blockSchema>;

export function isActiveAppointment(a: Pick<Appointment, "status">): boolean {
  return a.status === "booked" || a.status === "completed";
}
