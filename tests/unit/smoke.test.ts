import { describe, expect, it } from "vitest";
import { defaultBusinessConfig, resolveBusinessConfig } from "@/config/business";
import { parseEnv } from "@/config/env";

describe("smoke", () => {
  it("carga la configuración de negocio por defecto", () => {
    expect(defaultBusinessConfig.slots.granularityMinutes).toBe(15);
  });

  it("mezcla overrides de un salón sin mutar la base", () => {
    const resolved = resolveBusinessConfig({ gapfill: { offerTtlMinutes: 30 } });
    expect(resolved.gapfill.offerTtlMinutes).toBe(30);
    expect(resolved.gapfill.waveSize).toBe(defaultBusinessConfig.gapfill.waveSize);
    expect(defaultBusinessConfig.gapfill.offerTtlMinutes).toBe(15);
  });

  it("el entorno por defecto es la demo offline", () => {
    const env = parseEnv({});
    expect(env.DATA_BACKEND).toBe("memory");
    expect(env.MESSAGING_CHANNEL).toBe("simulator");
  });

  it("exige credenciales cuando se activa WhatsApp", () => {
    expect(() => parseEnv({ MESSAGING_CHANNEL: "whatsapp" })).toThrow(/WHATSAPP_ACCESS_TOKEN/);
  });
});
