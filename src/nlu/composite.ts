import { interpretRules } from "./rules";
import type { LLMProvider } from "./types";

export interface CompositeOptions {
  /** Por debajo de esta confianza de las reglas se consulta al LLM. */
  readonly threshold?: number;
  /** Tope de llamadas al LLM por día (UTC) y por proceso; pasado el tope, solo reglas. */
  readonly dailyLimit?: number;
  readonly now?: () => number;
}

/**
 * Reglas primero; el LLM solo para mensajes que las reglas no entienden bien (ahorra costo y latencia).
 * El tope diario es una guarda de gasto en código, además del límite mensual en la consola de Anthropic.
 */
export function createCompositeProvider(llm: LLMProvider, options: CompositeOptions = {}): LLMProvider {
  const { threshold = 0.5, dailyLimit = Number.POSITIVE_INFINITY, now = Date.now } = options;
  let day = "";
  let used = 0;
  return {
    name: "composite",
    async interpret(text, catalog, context) {
      const rules = interpretRules(text, catalog, context);
      if (rules.confidence >= threshold) return rules;
      const today = new Date(now()).toISOString().slice(0, 10);
      if (today !== day) {
        day = today;
        used = 0;
      }
      if (used >= dailyLimit) return rules;
      used += 1;
      return llm.interpret(text, catalog, context);
    },
  };
}
