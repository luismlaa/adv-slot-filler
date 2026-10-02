import { z } from "zod";

export const idSchema = z.string().min(1);
/** Instante absoluto en ISO-8601 UTC (`2026-10-03T14:00:00.000Z`). */
export const instantSchema = z.iso.datetime();
/** Fecha local del salón (`2026-10-03`). */
export const localDateSchema = z.iso.date();
/** Hora local del salón (`09:30`). */
export const localTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Hora inválida, se espera HH:mm");
export const phoneSchema = z.string().regex(/^\+\d{8,15}$/, "Teléfono en formato E.164 (+18095550101)");
export const moneySchema = z.number().nonnegative();

export type Id = z.infer<typeof idSchema>;
export type Instant = z.infer<typeof instantSchema>;
export type LocalDate = z.infer<typeof localDateSchema>;
export type LocalTime = z.infer<typeof localTimeSchema>;

export const timeRangeSchema = z
  .object({ start: localTimeSchema, end: localTimeSchema })
  .refine((r) => r.start < r.end, "El rango debe terminar después de empezar");
export type TimeRange = z.infer<typeof timeRangeSchema>;
