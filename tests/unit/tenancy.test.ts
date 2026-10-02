import { describe, expect, it, vi } from "vitest";
import { silentLogger } from "@/adapters/logging/json-logger";
import { createMemoryDirectory } from "@/adapters/memory/directory";
import { parseWebhookBatches } from "@/adapters/whatsapp/webhook";
import type { SalonScope } from "@/lib/container";
import inboundText from "../fixtures/whatsapp/inbound-text.json";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/container", () => ({ getContainer: () => ({}) }));
const { forEachSalon } = await import("@/lib/tenants");

describe("multi-tenant", () => {
  it("el webhook agrupa los mensajes por el número del negocio que los recibió", () => {
    const second = structuredClone(inboundText);
    second.entry[0]!.changes[0]!.value.metadata.phone_number_id = "222";
    const payload = { ...inboundText, entry: [...inboundText.entry, ...second.entry] };
    const batches = parseWebhookBatches(payload);
    expect(batches.map((b) => b.phoneNumberId)).toEqual(["106540352242922", "222"]);
    expect(batches.map((b) => b.messages.length)).toEqual([2, 2]);
  });

  it("los crons corren en cada salón activo y el fallo de uno no frena a los demás", async () => {
    const directory = { ...createMemoryDirectory(() => "x"), activeSalonIds: async () => ["salon-a", "salon-roto", "salon-b"] };
    const forSalon = async (salonId: string) => {
      if (salonId === "salon-roto") throw new Error("El salón salon-roto está inactivo");
      return { salonId } as SalonScope;
    };
    const seen: string[] = [];
    const runs = await forEachSalon("el tick", async (scope) => seen.push(scope.salonId), { directory, forSalon, logger: silentLogger });
    expect(seen).toEqual(["salon-a", "salon-b"]);
    expect(runs.map((r) => [r.salonId, r.ok])).toEqual([
      ["salon-a", true],
      ["salon-roto", false],
      ["salon-b", true],
    ]);
  });
});
