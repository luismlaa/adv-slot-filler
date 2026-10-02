import type { LocalDate } from "../model";
import { addDaysToDate, localParts } from "../time";

const WEEKDAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MONTHS = ["ene.", "feb.", "mar.", "abr.", "may.", "jun.", "jul.", "ago.", "sep.", "oct.", "nov.", "dic."];

/** "4:00 p. m." — formato de hora usado en RD. */
export function formatTime(time: string): string {
  const [h, m] = time.split(":").map(Number) as [number, number];
  const suffix = h >= 12 ? "p. m." : "a. m.";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** "hoy", "mañana", "el sábado 3 de oct." relativo a `today`. */
export function formatDay(date: LocalDate, today: LocalDate): string {
  if (date === today) return "hoy";
  if (date === addDaysToDate(today, 1)) return "mañana";
  const [, m, d] = date.split("-").map(Number) as [number, number, number];
  const weekday = WEEKDAYS[new Date(`${date}T12:00:00Z`).getUTCDay()]!;
  return `el ${weekday} ${d} de ${MONTHS[m - 1]}`;
}

/** "el sábado 3 de oct. a las 4:00 p. m." */
export function formatWhen(instantIso: string, timezone: string, today: LocalDate): string {
  const parts = localParts(Date.parse(instantIso), timezone);
  const hourWord = parts.time.startsWith("01:") || parts.time.startsWith("13:") ? "a la" : "a las";
  return `${formatDay(parts.date, today)} ${hourWord} ${formatTime(parts.time)}`;
}

export const firstNameOf = (name: string) => name.trim().split(/\s+/)[0] ?? name;

export function formatMoney(amount: number, currency: string): string {
  const symbol = currency === "DOP" ? "RD$" : currency === "USD" ? "US$" : `${currency} `;
  return `${symbol}${Math.round(amount).toLocaleString("en-US")}`;
}

const NUMBER_EMOJI = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣"];
export const optionMarker = (index: number) => NUMBER_EMOJI[index] ?? `${index + 1}.`;

/** Cierra una frase con punto sin duplicarlo ("… 4:00 p. m." no lleva otro punto). */
export const endSentence = (text: string) => (text.endsWith(".") ? text : `${text}.`);
