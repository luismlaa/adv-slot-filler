import { editDistance, normalizeText } from "@/domain/text";
import type { NluCatalog } from "./types";

/** Palabras que nombran la categoría "corte" en general, no un estilo concreto. */
const GENERIC_CUT = new Set(["corte", "recorte", "pelarme", "pelada", "pelado", "cortarme el pelo", "cortar el pelo", "cortarme", "pelo"]);

export interface ServiceMatch {
  readonly serviceId: string;
  readonly category?: string;
}

/** Busca el servicio por su palabra clave más larga ("corte y barba" gana a "corte"). */
export function matchService(text: string, catalog: NluCatalog): ServiceMatch | undefined {
  const candidates = catalog.services.flatMap((s) =>
    [s.name, ...s.keywords].map((k) => ({ service: s, keyword: normalizeText(k) })),
  );
  const hits = candidates
    .filter(({ keyword }) => keyword.length > 0 && new RegExp(`(?:^|\\s)${keyword}(?:\\s|$)`).test(text))
    .sort((a, b) => b.keyword.length - a.keyword.length);
  const best = hits[0];
  if (!best) return undefined;
  return GENERIC_CUT.has(best.keyword) ? { serviceId: best.service.id, category: "corte" } : { serviceId: best.service.id };
}

/** Palabras que nunca son un nombre aunque se parezcan (evita "corte" → "carlos" por fuzzy). */
const STOPWORDS = new Set(["quiero", "corte", "barba", "sabado", "manana", "tarde", "noche", "cuando", "tienen", "puedo", "favor", "gracias", "buenas", "hola"]);

/** Encuentra al estilista por nombre, apellido o apodo, tolerando un error de tipeo. */
export function matchStaff(text: string, catalog: NluCatalog): string | undefined {
  const tokens = text.split(" ").filter((t) => t.length >= 3 && !STOPWORDS.has(t));
  let best: { id: string; distance: number } | undefined;
  for (const staff of catalog.staff) {
    const names = [staff.name, ...staff.aliases].flatMap((n) => {
      const norm = normalizeText(n);
      return [norm, ...norm.split(" ")];
    });
    for (const name of new Set(names)) {
      if (name.includes(" ") ? text.includes(name) : tokens.includes(name)) return staff.id;
      if (name.length < 5 || name.includes(" ")) continue;
      for (const token of tokens) {
        const distance = editDistance(token, name);
        if (distance <= 1 && (!best || distance < best.distance)) best = { id: staff.id, distance };
      }
    }
  }
  return best?.id;
}

export const ANY_STAFF = /(cualquiera|cualquier barbero|el que (sea|este libre|tenga espacio)|quien sea|no importa (quien|con quien)|me da igual)/;

const ORDINALS: readonly [RegExp, number][] = [
  [/(?:^|\s)(primera|primero|1ra|1ero|opcion 1|la 1|el 1|numero 1)(?:\s|$)/, 1],
  [/(?:^|\s)(segunda|segundo|2da|2do|opcion 2|la 2|el 2|numero 2)(?:\s|$)/, 2],
  [/(?:^|\s)(tercera|tercero|3ra|3ro|opcion 3|la 3|el 3|numero 3)(?:\s|$)/, 3],
  [/(?:^|\s)(ultima|ultimo)(?:\s|$)/, 99],
];

/** Elección de una lista: "la primera", "opción 2", "3", "la última" (99 = última). */
export function matchChoice(text: string): number | undefined {
  const bare = text.match(/^(\d)$/);
  if (bare) return Number(bare[1]);
  return ORDINALS.find(([pattern]) => pattern.test(text))?.[1];
}
