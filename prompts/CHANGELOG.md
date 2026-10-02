# Prompts — changelog

Los prompts versionados nunca se editan en sitio: un cambio de comportamiento crea `vN+1/`.

## claude/v1 — 2026-10-02
- `interpret.md`: primer prompt del respaldo de NLU. Clasifica la intención y extrae entidades de un
  mensaje de WhatsApp en español dominicano. Reglas CAN/CANNOT explícitas; el mensaje del cliente se
  trata como dato (defensa contra prompt injection).
  **Por qué:** el parser por reglas cubre el corpus de prueba; Claude solo entra cuando la confianza
  de las reglas es < 0.5 (fase de deploy D4).
