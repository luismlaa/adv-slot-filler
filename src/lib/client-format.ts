import { formatMoney, formatTime } from "@/domain/conversation/format";

export { formatMoney, formatTime };

const pad = (n: number) => String(n).padStart(2, "0");

/** Hora local "HH:mm" de un instante ISO en la zona del salón (navegador-independiente). */
export function timeIn(iso: string, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(iso));
  const h = parts.find((p) => p.type === "hour")?.value ?? "00";
  const m = parts.find((p) => p.type === "minute")?.value ?? "00";
  return `${h}:${m}`;
}

export const minutesOfDay = (iso: string, timezone: string) => {
  const [h, m] = timeIn(iso, timezone).split(":").map(Number) as [number, number];
  return h * 60 + m;
};

export const hhmmToLabel = (time: string) => formatTime(time);
export const labelAt = (iso: string, timezone: string) => formatTime(timeIn(iso, timezone));

const WEEKDAYS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** "jue 1 oct" para una fecha local AAAA-MM-DD. */
export function shortDate(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function localDateIn(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

export const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

export function relativeMinutes(iso: string, nowIso: string): string {
  const diff = Math.round((Date.parse(iso) - Date.parse(nowIso)) / 60_000);
  if (diff <= 0) return "vencida";
  return diff < 60 ? `${diff} min` : `${Math.round(diff / 60)} h`;
}

export const percent = (ratio: number) => `${Math.round(ratio * 100)}%`;
