import { TZDate } from "@date-fns/tz";
import type { LocalDate, LocalTime } from "../model";

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

const pad = (n: number) => String(n).padStart(2, "0");

function parseLocalDate(date: LocalDate): [number, number, number] {
  const [y, m, d] = date.split("-").map(Number);
  if (y === undefined || m === undefined || d === undefined) throw new Error(`Fecha inválida: ${date}`);
  return [y, m, d];
}

function parseLocalTime(time: LocalTime): [number, number] {
  const [h, min] = time.split(":").map(Number);
  if (h === undefined || min === undefined) throw new Error(`Hora inválida: ${time}`);
  return [h, min];
}

/** Instante (ms) de una fecha+hora local en la zona del salón. */
export function zonedInstant(date: LocalDate, time: LocalTime, timezone: string): number {
  const [y, m, d] = parseLocalDate(date);
  const [h, min] = parseLocalTime(time);
  return new TZDate(y, m - 1, d, h, min, timezone).getTime();
}

export interface LocalParts {
  date: LocalDate;
  time: LocalTime;
  weekday: number;
  minutesOfDay: number;
}

export function localParts(instant: number, timezone: string): LocalParts {
  const z = new TZDate(instant, timezone);
  const date = `${z.getFullYear()}-${pad(z.getMonth() + 1)}-${pad(z.getDate())}`;
  const time = `${pad(z.getHours())}:${pad(z.getMinutes())}`;
  return { date, time, weekday: z.getDay(), minutesOfDay: z.getHours() * 60 + z.getMinutes() };
}

export const localDateOf = (instant: number, timezone: string): LocalDate => localParts(instant, timezone).date;

/** Suma días calendario a una fecha local (independiente de zona horaria). */
export function addDaysToDate(date: LocalDate, days: number): LocalDate {
  const [y, m, d] = parseLocalDate(date);
  const utc = new Date(Date.UTC(y, m - 1, d + days));
  return `${utc.getUTCFullYear()}-${pad(utc.getUTCMonth() + 1)}-${pad(utc.getUTCDate())}`;
}

export function weekdayOfDate(date: LocalDate): number {
  const [y, m, d] = parseLocalDate(date);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Diferencia en días calendario entre dos fechas locales (b - a). */
export function daysBetweenDates(a: LocalDate, b: LocalDate): number {
  const [ya, ma, da] = parseLocalDate(a);
  const [yb, mb, db] = parseLocalDate(b);
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / DAY);
}

export function minutesToTime(minutes: number): LocalTime {
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

export function timeToMinutes(time: LocalTime): number {
  const [h, m] = parseLocalTime(time);
  return h * 60 + m;
}

export const toIso = (instant: number): string => new Date(instant).toISOString();
export const fromIso = (iso: string): number => Date.parse(iso);

/** Lunes de la semana de una fecha local (semana lunes–domingo, como se usa en RD). */
export function startOfWeekDate(date: LocalDate): LocalDate {
  const weekday = weekdayOfDate(date);
  const offset = weekday === 0 ? -6 : 1 - weekday;
  return addDaysToDate(date, offset);
}
