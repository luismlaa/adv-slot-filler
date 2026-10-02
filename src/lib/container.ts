import "server-only";
import { FakeCalendarProvider } from "@/adapters/calendar/fake";
import { createGoogleCalendarProvider } from "@/adapters/calendar/google";
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
import type { CalendarProvider, Clock, MessagingChannel, Store } from "@/ports";
import { type CalendarSync, createCalendarSync } from "@/services/calendar-sync";
import type { AppContext } from "@/services/context";

/** Estado exclusivo de la demo: base en memoria, reloj simulado y Google Calendar simulado. */
export interface DemoRuntime {
  readonly holder: MemoryHolder;
  readonly clock: SimulatedClock;
  readonly calendar?: FakeCalendarProvider;
  seed: DemoSeed;
  reset(): void;
}

export interface Container {
  readonly env: Env;
  readonly ctx: AppContext;
  readonly calendarSync: CalendarSync;
  readonly demo?: DemoRuntime;
}

/** En la demo, Carlos ya tiene su Google Calendar conectado (simulado). */
export const DEMO_CALENDAR = { staffId: "staff-carlos", calendarId: "carlos.pena@gmail.com" } as const;

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
        runtime.calendar?.reset();
        if (runtime.calendar) void calendarSync.connect(DEMO_CALENDAR.staffId, DEMO_CALENDAR.calendarId);
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
      ? createCompositeProvider(createClaudeProvider({ apiKey: env.ANTHROPIC_API_KEY!, model: env.CLAUDE_MODEL, timeoutMs: env.LLM_TIMEOUT_MS, logger }), { dailyLimit: env.LLM_DAILY_LIMIT })
      : rulesProvider;

  const calendarProvider: CalendarProvider =
    env.CALENDAR_PROVIDER === "google"
      ? createGoogleCalendarProvider(
          { clientId: env.GOOGLE_CLIENT_ID!, clientSecret: env.GOOGLE_CLIENT_SECRET!, redirectUri: env.GOOGLE_REDIRECT_URI! },
          env.SALON_TIMEZONE,
          logger,
        )
      : new FakeCalendarProvider(() => clock.now());
  if (demo && calendarProvider instanceof FakeCalendarProvider) (demo as { calendar?: FakeCalendarProvider }).calendar = calendarProvider;

  const base: Omit<AppContext, "calendar"> = {
    store,
    clock,
    ids,
    bus,
    logger,
    messaging,
    nlu,
    config: async () => resolveBusinessConfig((await store.salon.get()).settings as BusinessConfigOverrides),
  };
  const calendarSync = createCalendarSync(base, calendarProvider, env.CALENDAR_PROVIDER === "google" ? env.GOOGLE_WEBHOOK_URL : undefined);
  const ctx: AppContext = { ...base, calendar: calendarSync.hooks };
  if (demo?.calendar) void calendarSync.connect(DEMO_CALENDAR.staffId, DEMO_CALENDAR.calendarId);
  logger.info("Slot Filler iniciado", { backend: env.DATA_BACKEND, demo: env.DEMO_MODE, messaging: messaging.name, nlu: nlu.name, calendar: env.CALENDAR_PROVIDER });
  return { env, ctx, calendarSync, demo };
}

const globalForContainer = globalThis as unknown as { __slotFiller?: Container };

/** Contenedor único por proceso (sobrevive al hot reload de `next dev`). */
export function getContainer(): Container {
  globalForContainer.__slotFiller ??= buildContainer();
  return globalForContainer.__slotFiller;
}
