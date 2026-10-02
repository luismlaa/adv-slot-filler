import { z } from "zod";
import { idSchema, moneySchema, phoneSchema, timeRangeSchema } from "./primitives";

/** Horario semanal: índice 0 = domingo … 6 = sábado; cada día, tramos de trabajo. */
export const weeklyScheduleSchema = z.array(z.array(timeRangeSchema)).length(7);
export type WeeklySchedule = z.infer<typeof weeklyScheduleSchema>;

export const salonSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  timezone: z.string().min(1),
  currency: z.string().length(3),
  phone: phoneSchema.optional(),
  address: z.string().optional(),
  slug: z.string().optional(),
  active: z.boolean().default(true),
  /** Número de WhatsApp Business del salón (Meta `phone_number_id`); todos bajo la misma app. */
  whatsappPhoneNumberId: z.string().optional(),
  /** Overrides de `config/business.json` específicos de este salón. */
  settings: z.record(z.string(), z.unknown()).default({}),
});
export type Salon = z.infer<typeof salonSchema>;

export const specialtySchema = z.object({
  id: idSchema,
  name: z.string().min(1),
});
export type Specialty = z.infer<typeof specialtySchema>;

/** Categoría de ciclo: servicios de la misma categoría comparten recurrencia (un fade y un corte clásico son "corte"). */
export const serviceCategorySchema = z.enum(["corte", "barba", "color", "tratamiento", "otro"]);
export type ServiceCategory = z.infer<typeof serviceCategorySchema>;

export const serviceSchema = z.object({
  id: idSchema,
  salonId: idSchema,
  name: z.string().min(1),
  category: serviceCategorySchema,
  durationMinutes: z.number().int().min(5).max(480),
  bufferMinutes: z.number().int().min(0).max(60).default(0),
  price: moneySchema,
  /** Especialidades que el estilista debe tener (todas). */
  requiredSpecialties: z.array(idSchema).default([]),
  /** Ciclo típico del servicio cuando el cliente aún no tiene historial. */
  defaultCycleDays: z.number().int().min(1).max(365),
  /** Palabras con las que los clientes piden este servicio ("pelarme", "fade", "desvanecido"). */
  keywords: z.array(z.string().min(1)).default([]),
  active: z.boolean().default(true),
});
export type Service = z.infer<typeof serviceSchema>;

export const staffSchema = z.object({
  id: idSchema,
  salonId: idSchema,
  name: z.string().min(1),
  /** Apodos o variantes con las que los clientes lo nombran ("Rafa", "el flaco"). */
  aliases: z.array(z.string().min(1)).default([]),
  specialties: z.array(idSchema),
  schedule: weeklyScheduleSchema,
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  phone: phoneSchema.optional(),
  active: z.boolean().default(true),
});
export type Staff = z.infer<typeof staffSchema>;

export const clientSchema = z.object({
  id: idSchema,
  salonId: idSchema,
  name: z.string().min(1),
  phone: phoneSchema,
  preferredStaffId: idSchema.optional(),
  /** El cliente pidió no recibir mensajes proactivos (respondió "BAJA"). */
  optedOut: z.boolean().default(false),
  notes: z.string().optional(),
  createdAt: z.iso.datetime(),
});
export type Client = z.infer<typeof clientSchema>;

export function staffCanPerform(staff: Pick<Staff, "specialties" | "active">, service: Pick<Service, "requiredSpecialties">): boolean {
  return staff.active && service.requiredSpecialties.every((s) => staff.specialties.includes(s));
}
