import { addDaysToDate, weekdayOfDate } from "@/domain/time";

/** Texto ya normalizado (sin acentos, minúsculas). */
type Normalized = string;

const WEEKDAYS: Readonly<Record<string, number>> = {
  domingo: 0,
  lunes: 1,
  martes: 2,
  miercoles: 3,
  jueves: 4,
  viernes: 5,
  sabado: 6,
};

const MONTHS: Readonly<Record<string, number>> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};

const NUMBER_WORDS: Readonly<Record<string, number>> = {
  una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12,
};

const pad = (n: number) => String(n).padStart(2, "0");

/** "mañana" como día, salvo "en/por/de la mañana" (franja horaria). */
const TOMORROW = /(?:^|\s)manana(?:\s|$)/;
const MORNING_PHRASE = /(?:en|por|de|a) la manana/;

/**
 * Fecha relativa a `today`: hoy, mañana, pasado mañana, días de la semana ("el sábado",
 * "el próximo martes"), "15 de octubre", "15/10", "el 15".
 */
export function parseDate(text: Normalized, today: string): string | undefined {
  if (/pasado manana/.test(text)) return addDaysToDate(today, 2);
  if (/(?:^|\s)(hoy|ahorita|ahora mismo)(?:\s|$)/.test(text)) return today;
  const withoutMorning = text.replace(MORNING_PHRASE, " ");
  if (TOMORROW.test(withoutMorning)) return addDaysToDate(today, 1);

  const dm = text.match(/(?:^|\s)(\d{1,2}) de ([a-z]+)/);
  if (dm && MONTHS[dm[2]!] !== undefined) return resolveDayMonth(Number(dm[1]), MONTHS[dm[2]!]!, today);
  const slash = text.match(/(?:^|\s)(\d{1,2})\/(\d{1,2})(?:\/\d{2,4})?(?:\s|$)/);
  if (slash) return resolveDayMonth(Number(slash[1]), Number(slash[2]), today);

  for (const [name, weekday] of Object.entries(WEEKDAYS)) {
    if (!new RegExp(`(?:^|\\s)${name}(?:\\s|$)`).test(text)) continue;
    const delta = (weekday - weekdayOfDate(today) + 7) % 7;
    const nextWeek = new RegExp(`(proximo|que viene|siguiente)\\s+${name}|${name}\\s+(que viene|proximo)`).test(text) && delta === 0;
    return addDaysToDate(today, delta === 0 && nextWeek ? 7 : delta);
  }

  const dayOnly = text.match(/(?:^|\s)el (\d{1,2})(?!\s*(?::|am|pm|de la))(?:\s|$)/);
  if (dayOnly && !/a las/.test(text.slice(Math.max(0, (dayOnly.index ?? 0) - 6), dayOnly.index))) {
    const day = Number(dayOnly[1]);
    const [y, m, d] = today.split("-").map(Number) as [number, number, number];
    if (day >= 1 && day <= 31) {
      const month = day >= d ? m : (m % 12) + 1;
      const year = day >= d ? y : m === 12 ? y + 1 : y;
      return validDate(year, month, day);
    }
  }
  return undefined;
}

function resolveDayMonth(day: number, month: number, today: string): string | undefined {
  const year = Number(today.slice(0, 4));
  const candidate = validDate(year, month, day);
  if (candidate === undefined) return undefined;
  return candidate < today ? validDate(year + 1, month, day) : candidate;
}

function validDate(year: number, month: number, day: number): string | undefined {
  const date = `${year}-${pad(month)}-${pad(day)}`;
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date ? undefined : date;
}

export interface TimeExpr {
  readonly time?: string;
  readonly window?: { readonly from: string; readonly to: string };
}

/** Franjas horarias habladas en RD. */
const WINDOWS: readonly [RegExp, string, string][] = [
  [/(en|por|de) la manana|temprano|tempranito|mananita/, "08:00", "12:00"],
  [/mediodia|medio dia|hora de almuerzo/, "11:30", "13:30"],
  [/(en|por|de) la tarde|tardecita|despues del almuerzo|en la tardecita/, "12:00", "18:00"],
  [/(en|por|de) la noche|nochecita|saliendo del trabajo|despues del trabajo/, "17:00", "20:00"],
];

/** Barbería: sin am/pm, 1–7 se entiende de la tarde y 8–11 de la mañana. */
function inferHour(hour: number, meridiem: string | undefined): number {
  if (meridiem === "pm" || meridiem === "tarde" || meridiem === "noche") return hour < 12 ? hour + 12 : hour;
  if (meridiem === "am" || meridiem === "manana") return hour === 12 ? 0 : hour;
  return hour >= 1 && hour <= 7 ? hour + 12 : hour;
}

/**
 * Hora exacta ("a las 3", "3:30 pm", "a las 10 de la mañana", "15:00") o franja
 * ("en la tarde", "después de las 5", "antes de las 12").
 */
export function parseTime(text: Normalized): TimeExpr {
  const hourToken = "(\\d{1,2}|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce)";
  const tail = "(?::(\\d{2})|\\s+y\\s+(media|cuarto))?\\s*(am|pm|a m|p m|de la (manana|tarde|noche))?";
  const toHour = (token: string) => (/^\d+$/.test(token) ? Number(token) : NUMBER_WORDS[token] ?? NaN);
  const meridiemOf = (m: RegExpMatchArray, ampmIndex: number, dayPartIndex: number) => {
    const ampm = m[ampmIndex]?.replace(" ", "");
    return m[dayPartIndex] ?? (ampm === "am" || ampm === "pm" ? ampm : undefined);
  };
  const build = (m: RegExpMatchArray) => {
    const hour = toHour(m[1]!);
    const minute = m[2] ? Number(m[2]) : m[3] === "media" ? 30 : m[3] === "cuarto" ? 15 : 0;
    const h = inferHour(hour, meridiemOf(m, 4, 5));
    return h < 24 && minute < 60 ? `${pad(h)}:${pad(minute)}` : undefined;
  };

  const after = text.match(new RegExp(`(?:despues de|luego de|a partir de) las ${hourToken}${tail}`));
  if (after) {
    const from = build(after);
    if (from) return { window: { from, to: "21:00" } };
  }
  const before = text.match(new RegExp(`antes de las ${hourToken}${tail}`));
  if (before) {
    const to = build(before);
    if (to) return { window: { from: "07:00", to } };
  }

  const exact =
    text.match(new RegExp(`(?:a las|a la|para las|tipo|como a las|a eso de las|eso de las|sobre las|las) ${hourToken}${tail}(?:\\s|$)`)) ??
    text.match(/(?:^|\s)(\d{1,2})(?::(\d{2}))()\s*(am|pm|a m|p m)?()(?:\s|$)/) ??
    text.match(/(?:^|\s)(\d{1,2})()()\s*(am|pm|a m|p m)()(?:\s|$)/);
  if (exact) {
    const time = build(exact);
    if (time) return { time };
  }

  for (const [pattern, from, to] of WINDOWS) {
    if (pattern.test(text)) return { window: { from, to } };
  }
  return {};
}
