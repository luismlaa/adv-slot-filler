import { normalizeText } from "@/domain/text";
import { parseDate, parseTime } from "./datetime";
import { ANY_STAFF, matchChoice, matchService, matchStaff } from "./entities";
import type { Entities, Intent, Interpretation, LLMProvider, NluCatalog, NluContext } from "./types";

const PATTERNS: Readonly<Record<Exclude<Intent, "book" | "choose" | "unknown">, RegExp>> = {
  opt_out: /^(baja|stop|parar)$|darme de baja|no me (escriban|manden|envien) mas|no quiero (mas )?mensajes/,
  opt_in: /^(alta|start|reanudar)$/,
  cancel: /cancel|anula|no (voy a poder|vo a poder|podre|puedo|voy a) (ir|llegar)|quita(r)? (mi|la) cita|no puedo ir/,
  reschedule: /(cambiar|mover|reprogramar|pasar|correr|rodar) (mi|la|el) (cita|turno|hora)|cambiar la hora|otra hora para mi cita/,
  waitlist: /avisa|avisame|avisen|lista de espera|si se libera|si se desocupa|si alguien cancela/,
  availability: /que (hay|tienen|tiene|tienes) (libre|disponible)|(tienen|tiene|tienes|hay) (espacio|chance|cupo|turno|algo)|disponib|a que hora|que horas|que hay para/,
  affirm: /^(si+|dale|ok|okey|okay|oki|claro|perfecto|de una|va|vale|listo|ta bien|ta bueno|esta bien|bien|me sirve|de acuerdo|confirmo|confirmado|apartamelo|apartalo|reservamelo|reservalo|seguro|por supuesto|eso mismo|esa|ese|correcto|exacto)(\s|$)/,
  deny: /^(no|nah|nop|nel|ahora no|otro dia|paso|no gracias|mejor no|negativo)(\s|$)/,
  thanks: /gracias|thank/,
  greeting: /^(hola|holi|buenas|buenos dias|buenas tardes|buenas noches|saludos|klk|que lo que|que tal|epa|dimelo|diga)/,
  help: /ayuda|como funciona|menu|que puedo hacer/,
  prices: /cuanto (cuesta|cobran|vale|sale|es|me sale|me cobran)|precio|tarifa|cuanto (es|son) el|a como (esta|sale|es)/,
  hours: /(a que hora|que hora|hasta que hora|cuando) (abren|cierran|abre|cierra|trabajan|atienden)|horario|estan abiertos|abren (hoy|mañana|el|los)|trabajan (hoy|el|los)/,
  location: /donde (queda|quedan|estan|esta ubicad|es)|direccion|ubicacion|como llego|por donde queda/,
};

const BOOKING_VERBS = /quiero|quisiera|me gustaria|necesito|ocupo|puedo ir|reserv|agend|apart|cita|turno|me atiende|me puede atender|me puedes atender|pelarme|cortarme|recortarme|arreglarme|hacerme|pasar(me)? por/;

function extractEntities(text: string, catalog: NluCatalog): Entities {
  const service = matchService(text, catalog);
  const { time, window } = parseTime(text);
  return {
    serviceId: service?.serviceId,
    serviceCategory: service?.category as Entities["serviceCategory"],
    staffId: matchStaff(text, catalog),
    anyStaff: ANY_STAFF.test(text) || undefined,
    date: parseDate(text, catalog.today),
    time,
    window,
    choice: matchChoice(text),
  };
}

const compact = (entities: Entities): Entities =>
  Object.fromEntries(Object.entries(entities).filter(([, v]) => v !== undefined)) as Entities;

/**
 * Intérprete por reglas, afinado para el español dominicano de WhatsApp.
 * Determinista, gratis y offline: cubre las intenciones de reserva; lo dudoso sale con confianza baja.
 */
export function interpretRules(raw: string, catalog: NluCatalog, context: NluContext = {}): Interpretation {
  const text = normalizeText(raw);
  const entities = compact(extractEntities(text, catalog));
  const result = (intent: Intent, confidence: number): Interpretation => ({ intent, confidence, entities, source: "rules" });
  const has = (intent: keyof typeof PATTERNS) => PATTERNS[intent].test(text);
  const hasBookingEntity = entities.serviceId !== undefined || entities.staffId !== undefined || entities.date !== undefined;
  const hasTiming = entities.date !== undefined || entities.time !== undefined || entities.window !== undefined;
  const awaitingList = context.awaiting === "choice" || context.awaiting === "reactivation";

  if (text === "") return result("unknown", 0);
  if (has("opt_out")) return result("opt_out", 0.95);
  if (has("opt_in")) return result("opt_in", 0.9);
  if (has("cancel") && !has("waitlist")) return result("cancel", 0.9);
  if (has("reschedule")) return result("reschedule", 0.85);
  if (has("waitlist")) return result("waitlist", 0.85);

  if (awaitingList && entities.choice !== undefined) return result("choose", 0.95);
  if (awaitingList && entities.time !== undefined && context.optionTimes?.includes(entities.time) && entities.date === undefined) {
    return result("choose", 0.9);
  }
  if (has("deny") && hasTiming) return result("book", 0.75);
  if (has("affirm") && !hasBookingEntity && entities.time === undefined) return result("affirm", 0.9);
  if (has("deny")) return result("deny", 0.9);

  if (has("hours")) return result("hours", 0.9);
  if (has("location")) return result("location", 0.9);
  if (has("prices")) return result("prices", 0.9);

  if (has("availability")) return result("availability", hasBookingEntity || hasTiming ? 0.9 : 0.8);
  if (BOOKING_VERBS.test(text) || hasBookingEntity || (hasTiming && context.awaiting !== undefined)) {
    const strong = BOOKING_VERBS.test(text) && (hasBookingEntity || hasTiming);
    return result("book", strong ? 0.9 : 0.7);
  }
  if (has("affirm")) return result("affirm", 0.8);
  if (entities.choice !== undefined) return result("choose", 0.6);
  if (has("thanks")) return result("thanks", 0.9);
  if (has("greeting")) return result("greeting", 0.9);
  if (has("help")) return result("help", 0.85);
  if (hasTiming) return result("book", 0.5);
  return result("unknown", 0.2);
}

export const rulesProvider: LLMProvider = {
  name: "rules",
  interpret: async (text, catalog, context) => interpretRules(text, catalog, context),
};
