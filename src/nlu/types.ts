import { z } from "zod";
import { localDateSchema, localTimeSchema, serviceCategorySchema } from "@/domain/model";

export const intentSchema = z.enum([
  "book",
  "availability",
  "choose",
  "affirm",
  "deny",
  "cancel",
  "reschedule",
  "waitlist",
  "greeting",
  "thanks",
  "opt_out",
  "opt_in",
  "help",
  "prices",
  "hours",
  "location",
  "unknown",
]);
export type Intent = z.infer<typeof intentSchema>;

export const entitiesSchema = z.object({
  serviceId: z.string().optional(),
  /** El cliente nombró la categoría ("un corte") y no un servicio concreto: usar su servicio habitual. */
  serviceCategory: serviceCategorySchema.optional(),
  staffId: z.string().optional(),
  /** "cualquiera", "el que esté libre". */
  anyStaff: z.boolean().optional(),
  date: localDateSchema.optional(),
  time: localTimeSchema.optional(),
  window: z.object({ from: localTimeSchema, to: localTimeSchema }).optional(),
  /** Opción elegida de una lista (1 = primera). */
  choice: z.number().int().positive().optional(),
});
export type Entities = z.infer<typeof entitiesSchema>;

/** Salida de cualquier intérprete (reglas o LLM) — se valida igual en ambos casos. */
export const interpretationSchema = z.object({
  intent: intentSchema,
  confidence: z.number().min(0).max(1),
  entities: entitiesSchema,
  source: z.enum(["rules", "claude"]),
});
export type Interpretation = z.infer<typeof interpretationSchema>;

export interface NluCatalog {
  readonly services: readonly { id: string; name: string; category: string; keywords: readonly string[] }[];
  readonly staff: readonly { id: string; name: string; aliases: readonly string[] }[];
  /** Fecha local de hoy en el salón (`2026-10-01`). */
  readonly today: string;
}

/** Contexto conversacional que ayuda a desambiguar ("sí" a qué, "la 2" de qué lista). */
export interface NluContext {
  readonly awaiting?: "choice" | "offer" | "confirmation" | "reactivation" | "cancel_confirmation";
  readonly optionTimes?: readonly string[];
}

/** Intérprete de mensajes: reglas propias (gratis) o LLM. */
export interface LLMProvider {
  readonly name: "rules" | "claude" | "composite";
  interpret(text: string, catalog: NluCatalog, context?: NluContext): Promise<Interpretation>;
}
