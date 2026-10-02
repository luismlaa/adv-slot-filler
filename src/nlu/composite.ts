import { interpretRules } from "./rules";
import type { LLMProvider } from "./types";

/** Reglas primero; el LLM solo para mensajes que las reglas no entienden bien (ahorra costo y latencia). */
export function createCompositeProvider(llm: LLMProvider, threshold = 0.5): LLMProvider {
  return {
    name: "composite",
    async interpret(text, catalog, context) {
      const rules = interpretRules(text, catalog, context);
      return rules.confidence >= threshold ? rules : llm.interpret(text, catalog, context);
    },
  };
}
