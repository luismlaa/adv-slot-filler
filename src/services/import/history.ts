import type { Appointment, AppointmentStatus, Client, Id, Service, Staff } from "@/domain/model";
import { normalizePhone, normalizeText } from "@/domain/text";
import { MINUTE, toIso, zonedInstant } from "@/domain/time";
import { parseCsv } from "./csv";

export interface ImportError {
  readonly line: number;
  readonly message: string;
}

export interface ImportResult {
  readonly clients: readonly Client[];
  readonly appointments: readonly Appointment[];
  readonly errors: readonly ImportError[];
}

export interface ImportContext {
  readonly salonId: Id;
  readonly timezone: string;
  readonly staff: readonly Staff[];
  readonly services: readonly Service[];
  readonly existingClients: readonly Client[];
  readonly now: number;
  readonly newId: () => Id;
}

const HEADER_ALIASES: Readonly<Record<string, readonly string[]>> = {
  name: ["cliente", "nombre", "name"],
  phone: ["telefono", "celular", "whatsapp", "phone", "movil"],
  date: ["fecha", "date", "dia"],
  time: ["hora", "time"],
  service: ["servicio", "service"],
  staff: ["estilista", "barbero", "staff", "profesional"],
  price: ["precio", "monto", "price", "total"],
  status: ["estado", "status"],
};

const STATUS_ALIASES: Readonly<Record<string, AppointmentStatus>> = {
  completada: "completed",
  completado: "completed",
  atendida: "completed",
  cancelada: "cancelled",
  cancelado: "cancelled",
  "no vino": "no_show",
  "no show": "no_show",
  no_show: "no_show",
};

function parseDate(raw: string): string | undefined {
  const value = raw.trim();
  const iso = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const latam = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  const [y, m, d] = iso ? [iso[1], iso[2], iso[3]] : latam ? [latam[3]!.length === 2 ? `20${latam[3]}` : latam[3], latam[2], latam[1]] : [];
  if (y === undefined || m === undefined || d === undefined) return undefined;
  const date = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date ? undefined : date;
}

function parseTime(raw: string | undefined): string | undefined {
  if (raw === undefined || raw.trim() === "") return "10:00";
  const m = normalizeText(raw).match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a m|p m)?$/);
  if (!m) return undefined;
  let hour = Number(m[1]);
  const minute = Number(m[2] ?? "0");
  if (m[3]?.startsWith("p") && hour < 12) hour += 12;
  if (m[3]?.startsWith("a") && hour === 12) hour = 0;
  return hour < 24 && minute < 60 ? `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}` : undefined;
}

function matchService(raw: string, services: readonly Service[]): Service | undefined {
  const value = normalizeText(raw);
  return (
    services.find((s) => normalizeText(s.name) === value) ??
    services.find((s) => s.keywords.some((k) => normalizeText(k) === value)) ??
    services.find((s) => s.keywords.some((k) => value.includes(normalizeText(k))))
  );
}

function matchStaff(raw: string, staff: readonly Staff[]): Staff | undefined {
  const value = normalizeText(raw);
  return staff.find((s) => [s.name, ...s.aliases].some((n) => normalizeText(n) === value || normalizeText(n).split(" ")[0] === value));
}

/**
 * Importa el historial de un salón desde CSV (export de su sistema actual o una hoja de cálculo).
 * Es puro: devuelve clientes nuevos, citas y errores por línea; el llamador decide si persistir.
 * El historial es lo que permite calcular el ciclo real de cada cliente desde el día uno.
 */
export function importHistoryCsv(csv: string, ctx: ImportContext): ImportResult {
  const [header, ...body] = parseCsv(csv);
  if (!header) return { clients: [], appointments: [], errors: [{ line: 1, message: "El archivo está vacío" }] };
  const columns = header.map((h) => normalizeText(h));
  const index = (field: string) => columns.findIndex((c) => HEADER_ALIASES[field]!.includes(c));
  const col = Object.fromEntries(Object.keys(HEADER_ALIASES).map((f) => [f, index(f)])) as Record<keyof typeof HEADER_ALIASES, number>;
  const missing = ["name", "phone", "date", "service", "staff"].filter((f) => col[f]! < 0);
  if (missing.length > 0) {
    return { clients: [], appointments: [], errors: [{ line: 1, message: `Faltan columnas: ${missing.join(", ")}` }] };
  }

  const clientsByPhone = new Map(ctx.existingClients.map((c) => [c.phone, c]));
  const newClients: Client[] = [];
  const appointments: Appointment[] = [];
  const errors: ImportError[] = [];

  body.forEach((cells, i) => {
    const line = i + 2;
    const cell = (field: string) => (col[field]! >= 0 ? cells[col[field]!]?.trim() : undefined);
    const fail = (message: string) => errors.push({ line, message });

    const phone = normalizePhone(cell("phone") ?? "");
    if (!phone) return fail(`Teléfono inválido: "${cell("phone") ?? ""}"`);
    const date = parseDate(cell("date") ?? "");
    if (!date) return fail(`Fecha inválida: "${cell("date") ?? ""}" (usa AAAA-MM-DD o DD/MM/AAAA)`);
    const time = parseTime(cell("time"));
    if (!time) return fail(`Hora inválida: "${cell("time") ?? ""}"`);
    const service = matchService(cell("service") ?? "", ctx.services);
    if (!service) return fail(`Servicio no reconocido: "${cell("service") ?? ""}"`);
    const staff = matchStaff(cell("staff") ?? "", ctx.staff);
    if (!staff) return fail(`Estilista no reconocido: "${cell("staff") ?? ""}"`);
    const statusRaw = normalizeText(cell("status") ?? "");
    const status = statusRaw === "" ? undefined : STATUS_ALIASES[statusRaw];
    if (statusRaw !== "" && !status) return fail(`Estado no reconocido: "${cell("status") ?? ""}"`);
    const priceRaw = cell("price");
    const price = priceRaw ? Number(priceRaw.replace(/[^\d.]/g, "")) : service.price;
    if (!Number.isFinite(price)) return fail(`Precio inválido: "${priceRaw ?? ""}"`);

    const start = zonedInstant(date, time, ctx.timezone);
    const end = start + service.durationMinutes * MINUTE;
    const effectiveStatus = status ?? (start < ctx.now ? "completed" : "booked");
    const active = effectiveStatus === "completed" || effectiveStatus === "booked";
    if (active && appointments.some((a) => a.staffId === staff.id && (a.status === "completed" || a.status === "booked") && Date.parse(a.start) < end && start < Date.parse(a.end))) {
      return fail(`Choca con otra cita de ${staff.name} el ${date} a las ${time}`);
    }

    let client = clientsByPhone.get(phone);
    if (!client) {
      const name = cell("name");
      if (!name) return fail("Falta el nombre del cliente");
      client = { id: ctx.newId(), salonId: ctx.salonId, name, phone, optedOut: false, createdAt: toIso(ctx.now) };
      clientsByPhone.set(phone, client);
      newClients.push(client);
    }

    appointments.push({
      id: ctx.newId(),
      salonId: ctx.salonId,
      clientId: client.id,
      staffId: staff.id,
      serviceId: service.id,
      start: toIso(start),
      end: toIso(end),
      status: effectiveStatus,
      source: "import",
      price,
      createdAt: toIso(Math.min(start, ctx.now)),
    });
  });

  return { clients: newClients, appointments, errors };
}
