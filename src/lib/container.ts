import "server-only";
import { createClaudeProvider } from "@/adapters/llm/claude";
import { createJsonLogger } from "@/adapters/logging/json-logger";
import { InMemoryEventBus, SimulatedClock, randomIds, systemClock } from "@/adapters/memory/runtime";
import { type DemoSeed, seedDemo } from "@/adapters/memory/seed";
import { createMemoryStore, type MemoryHolder } from "@/adapters/memory/store";
import { createServiceClient } from "@/adapters/supabase/client";
import { createSupabaseStore } from "@/adapters/supabase/store";
import { createWhatsAppChannel } from "@/adapters/whatsapp/cloud-api";
import { createSimulatorChannel } from "@/adapters/whatsapp/simulator";
import { type BusinessConfigOverrides, resolveBusinessConfig } from "@/config/business";
import { type Env, getEnv } from "@/config/env";
import { createCompositeProvider } from "@/nlu/composite";
import { rulesProvider } from "@/nlu/rules";
import type { Clock, MessagingChannel, Store } from "@/ports";
import type { AppContext } from "@/services/context";

/** Estado exclusivo de la demo: base en memoria y reloj simulado. */
export interface DemoRuntime {
  readonly holder: MemoryHolder;
  readonly clock: SimulatedClock;
  seed: DemoSeed;
  reset(): void;
}

export interface Container {
  readonly env: Env;
  readonly ctx: AppContext;
  readonly demo?: DemoRuntime;
}

function buildContainer(): Container {
  const env = getEnv();
  const logger = createJsonLogger(env.LOG_LEVEL);
  const bus = new InMemoryEventBus();
  const ids = randomIds;

  let store: Store;
  let clock: Clock = systemClock;
  let demo: DemoRuntime | undefined;

  if (env.DATA_BACKEND === "memory") {
    const seed = seedDemo();
    const holder: MemoryHolder = { db: seed.db };
    const simulated = new SimulatedClock(seed.anchor, true);
    store = createMemoryStore(holder);
    clock = env.DEMO_MODE ? simulated : systemClock;
    const runtime: DemoRuntime = {
      holder,
      clock: simulated,
      seed,
      reset() {
        const fresh = seedDemo({ anchor: runtime.seed.anchor });
        runtime.seed = fresh;
        holder.db = fresh.db;
        simulated.set(fresh.anchor);
        bus.publish({ type: "demo.reset", salonId: fresh.db.salon.id, at: new Date(fresh.anchor).toISOString(), payload: {} });
      },
    };
    demo = runtime;
  } else {
    store = createSupabaseStore(createServiceClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!), env.SALON_ID!);
  }

  const messaging: MessagingChannel =
    env.MESSAGING_CHANNEL === "whatsapp"
      ? createWhatsAppChannel(
          {
            phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID!,
            accessToken: env.WHATSAPP_ACCESS_TOKEN!,
            apiVersion: env.WHATSAPP_API_VERSION,
            dryRun: env.MESSAGING_DRY_RUN,
          },
          logger,
        )
      : createSimulatorChannel(ids.newId);

  const nlu =
    env.LLM_PROVIDER === "claude"
      ? createCompositeProvider(createClaudeProvider({ apiKey: env.ANTHROPIC_API_KEY!, model: env.CLAUDE_MODEL, timeoutMs: env.LLM_TIMEOUT_MS, logger }))
      : rulesProvider;

  const ctx: AppContext = {
    store,
    clock,
    ids,
    bus,
    logger,
    messaging,
    nlu,
    config: async () => resolveBusinessConfig((await store.salon.get()).settings as BusinessConfigOverrides),
  };
  logger.info("Slot Filler iniciado", { backend: env.DATA_BACKEND, demo: env.DEMO_MODE, messaging: messaging.name, nlu: nlu.name, calendar: env.CALENDAR_PROVIDER });
  return { env, ctx, demo };
}

const globalForContainer = globalThis as unknown as { __slotFiller?: Container };

/** Contenedor único por proceso (sobrevive al hot reload de `next dev`). */
export function getContainer(): Container {
  globalForContainer.__slotFiller ??= buildContainer();
  return globalForContainer.__slotFiller;
}
