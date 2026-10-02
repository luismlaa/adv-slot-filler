import type { z } from "zod";

/** Campos del dominio cuyo nombre de columna no es el snake_case directo. */
const COLUMN_OVERRIDES: Readonly<Record<string, string>> = { start: "start_at", end: "end_at" };
const FIELD_OVERRIDES: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(COLUMN_OVERRIDES).map(([field, column]) => [column, field]),
);

const toSnake = (key: string) => COLUMN_OVERRIDES[key] ?? key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
const toCamel = (column: string) => FIELD_OVERRIDES[column] ?? column.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

const TIMESTAMP = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/;

/** Objeto de dominio → fila (snake_case, `undefined` → `null`). */
export function toRow(record: object): Record<string, unknown> {
  return Object.fromEntries(Object.entries(record).map(([key, value]) => [toSnake(key), value === undefined ? null : value]));
}

/** Patch parcial → columnas (omite claves sin valor definido salvo las que se limpian explícitamente). */
export function toPatch(patch: object): Record<string, unknown> {
  return Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined).map(([k, v]) => [toSnake(k), v]));
}

/**
 * Fila → objeto de dominio validado. Normaliza lo que PostgREST devuelve distinto al dominio:
 * `null` → ausente, timestamps con offset → ISO UTC, numeric como string → number.
 */
export function fromRow<S extends z.ZodType>(schema: S, row: Record<string, unknown>, numericColumns: readonly string[] = []): z.infer<S> {
  const normalized = Object.fromEntries(
    Object.entries(row)
      .filter(([, v]) => v !== null)
      .map(([column, value]) => {
        if (numericColumns.includes(column) && typeof value === "string") return [toCamel(column), Number(value)];
        if (typeof value === "string" && TIMESTAMP.test(value) && column !== "due_date") return [toCamel(column), new Date(value).toISOString()];
        return [toCamel(column), value];
      }),
  );
  return schema.parse(normalized);
}

export const TABLES = {
  salons: "salons",
  specialties: "specialties",
  staff: "staff",
  services: "services",
  clients: "clients",
  appointments: "appointments",
  blocks: "blocks",
  waitlist: "waitlist_entries",
  gaps: "gaps",
  offers: "offers",
  nudges: "nudges",
  messages: "messages",
  conversations: "conversations",
  calendarLinks: "calendar_links",
  activity: "activity",
} as const;
