import { describe, expect, it } from "vitest";
import { createClaudeProvider } from "@/adapters/llm/claude";
import { silentLogger } from "@/adapters/logging/json-logger";
import { demoServices, demoStaff } from "@/adapters/memory/seed/catalog";
import { createCompositeProvider } from "@/nlu/composite";

const catalog = { services: demoServices, staff: demoStaff, today: "2026-10-01" };

const reply = (payload: unknown, status = 200): typeof fetch =>
  (async () =>
    new Response(
      JSON.stringify(
        status === 200
          ? {
              id: "msg_test",
              type: "message",
              role: "assistant",
              model: "claude-opus-5-5",
              content: [{ type: "text", text: JSON.stringify(payload) }],
              stop_reason: "end_turn",
              stop_sequence: null,
              usage: { input_tokens: 10, output_tokens: 10 },
            }
          : { type: "error", error: { type: "api_error", message: "boom" } },
      ),
      { status, headers: { "content-type": "application/json" } },
    )) as typeof fetch;

const provider = (fetchImpl: typeof fetch) =>
  createClaudeProvider({ apiKey: "test-key", model: "claude-opus-5-5", timeoutMs: 2000, logger: silentLogger, fetch: fetchImpl });

const valid = {
  intent: "book",
  confidence: 0.85,
  serviceId: "svc-fade",
  serviceCategory: null,
  staffId: "staff-carlos",
  anyStaff: null,
  date: "2026-10-03",
  time: null,
  windowFrom: "12:00",
  windowTo: "18:00",
  choice: null,
};

describe("Claude como respaldo del intérprete", () => {
  it("convierte la salida estructurada en una interpretación validada", async () => {
    const result = await provider(reply(valid)).interpret("ese día después del almuerzo con el de los fades", catalog);
    expect(result).toMatchObject({ intent: "book", source: "claude", entities: { serviceId: "svc-fade", staffId: "staff-carlos", window: { from: "12:00", to: "18:00" } } });
  });

  it("descarta ids que no existen en el catálogo (no inventa barberos)", async () => {
    const result = await provider(reply({ ...valid, staffId: "staff-inventado" })).interpret("x", catalog);
    expect(result.entities.staffId).toBeUndefined();
  });

  it("si la API falla, cae a las reglas sin romper la conversación", async () => {
    const result = await provider(reply({}, 500)).interpret("quiero un fade el sábado", catalog);
    expect(result).toMatchObject({ intent: "book", source: "rules" });
  });

  it("si la salida no cumple el esquema, cae a las reglas", async () => {
    const result = await provider(reply({ intent: "volar" })).interpret("hola", catalog);
    expect(result.source).toBe("rules");
  });

  it("el compuesto solo llama al LLM cuando las reglas dudan", async () => {
    let calls = 0;
    const counting: typeof fetch = async (...args) => {
      calls += 1;
      return reply(valid)(...args);
    };
    const composite = createCompositeProvider(provider(counting));
    await composite.interpret("quiero corte con Carlos el sábado", catalog);
    expect(calls).toBe(0);
    await composite.interpret("eso que hablamos la otra vez pero con el otro", catalog);
    expect(calls).toBe(1);
  });

  it("pasado el tope diario solo usa reglas, y al día siguiente vuelve a consultar", async () => {
    let calls = 0;
    const counting: typeof fetch = async (...args) => {
      calls += 1;
      return reply(valid)(...args);
    };
    let now = Date.parse("2026-10-01T12:00:00Z");
    const composite = createCompositeProvider(provider(counting), { dailyLimit: 1, now: () => now });
    const vague = "eso que hablamos la otra vez pero con el otro";
    expect((await composite.interpret(vague, catalog)).source).toBe("claude");
    expect((await composite.interpret(vague, catalog)).source).toBe("rules");
    now += 24 * 3_600_000;
    await composite.interpret(vague, catalog);
    expect(calls).toBe(2);
  });
});
