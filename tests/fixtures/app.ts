import { silentLogger } from "@/adapters/logging/json-logger";
import { InMemoryEventBus, SimulatedClock } from "@/adapters/memory/runtime";
import { seedDemo } from "@/adapters/memory/seed";
import { createMemoryStore, type MemoryHolder } from "@/adapters/memory/store";
import { createSimulatorChannel } from "@/adapters/whatsapp/simulator";
import { type BusinessConfigOverrides, resolveBusinessConfig } from "@/config/business";
import { zonedInstant } from "@/domain/time";
import { rulesProvider } from "@/nlu/rules";
import type { DomainEvent } from "@/ports";
import type { AppContext } from "@/services/context";

export const DEMO_ANCHOR = zonedInstant("2026-10-01", "10:00", "America/Santo_Domingo");

/** Contexto de aplicación completo sobre el seed de la demo, con reloj detenido. */
export function buildTestApp(anchor = DEMO_ANCHOR) {
  const seed = seedDemo({ anchor });
  const holder: MemoryHolder = { db: seed.db };
  const store = createMemoryStore(holder);
  const clock = new SimulatedClock(anchor, false);
  const bus = new InMemoryEventBus();
  const events: DomainEvent[] = [];
  bus.subscribe((e) => events.push(e));
  let n = 0;
  const ids = { newId: () => `t-${(++n).toString().padStart(5, "0")}` };
  const ctx: AppContext = {
    store,
    clock,
    ids,
    bus,
    logger: silentLogger,
    messaging: createSimulatorChannel(ids.newId),
    nlu: rulesProvider,
    config: async () => resolveBusinessConfig((await store.salon.get()).settings as BusinessConfigOverrides),
  };
  return { ctx, holder, clock, events, seed };
}

let wamid = 0;
export const inbound = (from: string, text: string) => ({
  from,
  text,
  providerMessageId: `wamid-${++wamid}`,
  at: new Date().toISOString(),
});
