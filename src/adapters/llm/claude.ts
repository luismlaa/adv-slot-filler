import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { interpretRules } from "@/nlu/rules";
import { type Interpretation, type LLMProvider, type NluCatalog, type NluContext, intentSchema, interpretationSchema } from "@/nlu/types";
import type { Logger } from "@/ports";
import { INTERPRET_PROMPT_V1 } from "../../../prompts/claude/v1/interpret";

/** Esquema de salida que se le pide a Claude (todo requerido, `null` = no aplica). */
const claudeOutputSchema = z.object({
  intent: intentSchema,
  confidence: z.number(),
  serviceId: z.string().nullable(),
  serviceCategory: z.enum(["corte", "barba", "color", "tratamiento", "otro"]).nullable(),
  staffId: z.string().nullable(),
  anyStaff: z.boolean().nullable(),
  date: z.string().nullable(),
  time: z.string().nullable(),
  windowFrom: z.string().nullable(),
  windowTo: z.string().nullable(),
  choice: z.number().nullable(),
});


export interface ClaudeProviderOptions {
  readonly apiKey: string;
  readonly model: string;
  readonly timeoutMs: number;
  readonly logger: Logger;
  /** Inyectable para pruebas (sin red). */
  readonly fetch?: typeof fetch;
}

/** Catálogo serializado de forma estable (mismo orden siempre → caché de prompt efectiva). */
function describeCatalog(catalog: NluCatalog): string {
  const services = [...catalog.services].sort((a, b) => a.id.localeCompare(b.id)).map((s) => `- ${s.id}: ${s.name} (${s.category}; dicen: ${s.keywords.join(", ")})`);
  const staff = [...catalog.staff].sort((a, b) => a.id.localeCompare(b.id)).map((s) => `- ${s.id}: ${s.name}${s.aliases.length ? ` (apodos: ${s.aliases.join(", ")})` : ""}`);
  return `## Servicios\n${services.join("\n")}\n\n## Estilistas\n${staff.join("\n")}`;
}

/**
 * Intérprete con Claude (structured outputs). Se usa solo como respaldo del parser por reglas.
 * Cualquier fallo (timeout, rechazo, salida inválida) devuelve la interpretación por reglas.
 */
export function createClaudeProvider(options: ClaudeProviderOptions): LLMProvider {
  const client = new Anthropic({ apiKey: options.apiKey, timeout: options.timeoutMs, maxRetries: 1, fetch: options.fetch });
  const system = INTERPRET_PROMPT_V1;

  return {
    name: "claude",
    async interpret(text: string, catalog: NluCatalog, context: NluContext = {}): Promise<Interpretation> {
      const fallback = interpretRules(text, catalog, context);
      try {
        const response = await client.beta.messages.parse({
          model: options.model,
          max_tokens: 1024,
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          system: [
            { type: "text", text: system },
            { type: "text", text: describeCatalog(catalog), cache_control: { type: "ephemeral" } },
          ],
          output_config: { effort: "low", format: betaZodOutputFormat(claudeOutputSchema) },
          messages: [
            {
              role: "user",
              content: `Hoy es ${catalog.today}.${context.awaiting ? ` El sistema espera: ${context.awaiting}.` : ""}${
                context.optionTimes?.length ? ` Opciones ofrecidas a las: ${context.optionTimes.join(", ")}.` : ""
              }\n\n<mensaje_cliente>\n${text}\n</mensaje_cliente>`,
            },
          ],
        });
        if (response.stop_reason === "refusal" || !response.parsed_output) {
          options.logger.warn("Claude no devolvió una interpretación; se usan las reglas", { stopReason: response.stop_reason });
          return fallback;
        }
        const out = response.parsed_output;
        const candidate = {
          intent: out.intent,
          confidence: Math.min(1, Math.max(0, out.confidence)),
          source: "claude" as const,
          entities: Object.fromEntries(
            Object.entries({
              serviceId: catalog.services.some((s) => s.id === out.serviceId) ? out.serviceId : null,
              serviceCategory: out.serviceCategory,
              staffId: catalog.staff.some((s) => s.id === out.staffId) ? out.staffId : null,
              anyStaff: out.anyStaff,
              date: out.date,
              time: out.time,
              window: out.windowFrom && out.windowTo ? { from: out.windowFrom, to: out.windowTo } : null,
              choice: out.choice,
            }).filter(([, v]) => v !== null),
          ),
        };
        const parsed = interpretationSchema.safeParse(candidate);
        if (!parsed.success) {
          options.logger.warn("Interpretación de Claude inválida; se usan las reglas", { issues: parsed.error.issues.length });
          return fallback;
        }
        return parsed.data;
      } catch (error) {
        options.logger.error("Fallo llamando a Claude; se usan las reglas", { error: error instanceof Error ? error.message : String(error) });
        return fallback;
      }
    },
  };
}
