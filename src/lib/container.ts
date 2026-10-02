import "server-only";
import { FakeCalendarProvider } from "@/adapters/calendar/fake";
import { createGoogleCalendarProvider } from "@/adapters/calendar/google";
import { createClaudeProvider } from "@/adapters/llm/claude";
import { createJsonLogger } from "@/adapters/logging/json-logger";
import { createMemoryDirectory } from "@/adapters/memory/directory";
import { InMemoryEventBus, SimulatedClock, randomIds, systemClock } from "@/adapters/memory/runtime";
import { type DemoSeed, seedDemo } from "@/adapters/memory/seed";
import { createMemoryStore, type MemoryHolder } from "@/adapters/memory/store";
import { createServiceClient } from "@/adapters/supabase/client";
import { createSupabaseDirectory } from "@/adapters/supabase/directory";
import { createSupabaseStore } from "@/adapters/supabase/store";
import { createWhatsAppChannel } from "@/adapters/whatsapp/cloud-api";
import { createSimulatorChannel } from "@/adapters/whatsapp/simulator";
import { type BusinessConfigOverrides, resolveBusinessConfig } from "@/config/business";
import { type Env, getEnv } from "@/config/env";
import type { Salon } from "@/domain/model";
import { createCompositeProvider } from "@/nlu/composite";
import { rulesProvider } from "@/nlu/rules";
import type { LLMProvider } from "@/nlu/types";
import type { CalendarProvider, Clock, EventBus, Logger, MessagingChannel, Store, TenantDirectory } from "@/ports";
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

/** Todo lo que un caso de uso necesita para UN salón. */
export interface SalonScope {
  readonly salonId: string;
  readonly ctx: AppContext;
  readonly calendarSync: CalendarSync;
}

export interface Container {
  readonly env: Env;
  readonly logger: Logger;
  readonly directory: TenantDirectory;
  readonly demo?: DemoRuntime;
  /** Contexto acotado a un salón (cacheado por instancia). Falla si el salón no existe o está inactivo. */
  forSalon(salonId: string): Promise<SalonScope>;
}

/** En la demo, Carlos ya tiene su Google Calendar conectado (simulado). */
export const DEMO_CALENDAR = { staffId: "staff-carlos", calendarId: "carlos.pena@gmail.com" } as const;

/** Un salón con `whatsappPhoneNumberId` propio; sin número, sus envíos quedan en el log (dry-run). */
function messagingFor(env: Env, salon: Salon, logger: Logger): MessagingChannel {
  if (env.MESSAGING_CHANNEL !== "whatsapp") return createSimulatorChannel(randomIds.newId);
  const phoneNumberId = salon.whatsappPhoneNumberId ?? env.WHATSAPP_PHONE_NUMBER_ID;
  if (!phoneNumberId) logger.warn("Salón sin número de WhatsApp: los envíos quedan en dry-run", { salonId: salon.id });
  return createWhatsAppChannel(
    { phoneNumberId: phoneNumberId ?? "sin-numero", accessToken: env.WHATSAPP_ACCESS_TOKEN!, apiVersion: env.WHATSAPP_API_VERSION, dryRun: env.MESSAGING_DRY_RUN || !phoneNumberId },
    logger,
  );
}

interface Shared {
  readonly env: Env;
  readonly logger: Logger;
  readonly bus: EventBus;
  readonly clock: Clock;
  readonly nlu: LLMProvider;
  readonly calendarProvider: CalendarProvider;
}

function buildScope(shared: Shared, store: Store, salon: Salon, messaging: MessagingChannel): SalonScope {
  const { env, logger, bus, clock, nlu, calendarProvider } = shared;
  const base: Omit<AppContext, "calendar"> = {
    store,
    clock,
    ids: randomIds,
    bus,
    logger,
    messaging,
    nlu,
    config: async () => resolveBusinessConfig((await store.salon.get()).settings as BusinessConfigOverrides),
  };
  const calendarSync = createCalendarSync(base, calendarProvider, env.CALENDAR_PROVIDER === "google" ? env.GOOGLE_WEBHOOK_URL : undefined);
  return { salonId: salon.id, ctx: { ...base, calendar: calendarSync.hooks }, calendarSync };
}

/** Los contextos por salón se reconstruyen cada tanto para recoger cambios (p. ej. el número de WhatsApp). */
const SCOPE_TTL_MS = 10 * 60_000;

function buildContainer(): Container {
  const env = getEnv();
  const logger = createJsonLogger(env.LOG_LEVEL);
  const bus = new InMemoryEventBus();
  const nlu =
    env.LLM_PROVIDER === "claude"
      ? createCompositeProvider(createClaudeProvider({ apiKey: env.ANTHROPIC_API_KEY!, model: env.CLAUDE_MODEL, timeoutMs: env.LLM_TIMEOUT_MS, logger }), { dailyLimit: env.LLM_DAILY_LIMIT })
      : rulesProvider;

  if (env.DATA_BACKEND === "memory") {
    // Demo / desarrollo: un solo salón (el seed) en memoria, con reloj y calendario simulados.
    const seed = seedDemo();
    const holder: MemoryHolder = { db: seed.db };
    const simulated = new SimulatedClock(seed.anchor, true);
    const clock = env.DEMO_MODE ? simulated : systemClock;
    const calendarProvider: CalendarProvider =
      env.CALENDAR_PROVIDER === "google"
        ? createGoogleCalendarProvider({ clientId: env.GOOGLE_CLIENT_ID!, clientSecret: env.GOOGLE_CLIENT_SECRET!, redirectUri: env.GOOGLE_REDIRECT_URI! }, env.SALON_TIMEZONE, logger)
        : new FakeCalendarProvider(() => clock.now());
    const fakeCalendar = calendarProvider instanceof FakeCalendarProvider ? calendarProvider : undefined;
    const store = createMemoryStore(holder);
    const scope = buildScope({ env, logger, bus, clock, nlu, calendarProvider }, store, seed.db.salon, messagingFor(env, seed.db.salon, logger));
    const connectDemoCalendar = () => {
      if (fakeCalendar) void scope.calendarSync.connect(DEMO_CALENDAR.staffId, DEMO_CALENDAR.calendarId);
    };
    const demo: DemoRuntime = {
      holder,
      clock: simulated,
      calendar: fakeCalendar,
      seed,
      reset() {
        const fresh = seedDemo({ anchor: demo.seed.anchor });
        demo.seed = fresh;
        holder.db = fresh.db;
        simulated.set(fresh.anchor);
        fakeCalendar?.reset();
        connectDemoCalendar();
        bus.publish({ type: "demo.reset", salonId: fresh.db.salon.id, at: new Date(fresh.anchor).toISOString(), payload: {} });
      },
    };
    connectDemoCalendar();
    logger.info("Slot Filler iniciado", { backend: env.DATA_BACKEND, demo: env.DEMO_MODE, messaging: scope.ctx.messaging.name, nlu: nlu.name, calendar: env.CALENDAR_PROVIDER });
    return {
      env,
      logger,
      directory: createMemoryDirectory(() => holder.db.salon.id),
      demo: env.DEMO_MODE ? demo : undefined,
      forSalon: async () => scope,
    };
  }

  // Producción: una instancia para N salones. Cada salón tiene su Store acotado por `salon_id`.
  const db = createServiceClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!);
  const calendarProvider: CalendarProvider =
    env.CALENDAR_PROVIDER === "google"
      ? createGoogleCalendarProvider({ clientId: env.GOOGLE_CLIENT_ID!, clientSecret: env.GOOGLE_CLIENT_SECRET!, redirectUri: env.GOOGLE_REDIRECT_URI! }, env.SALON_TIMEZONE, logger)
      : new FakeCalendarProvider(() => systemClock.now());
  const shared: Shared = { env, logger, bus, clock: systemClock, nlu, calendarProvider };
  const scopes = new Map<string, { at: number; scope: Promise<SalonScope> }>();

  const forSalon = (salonId: string): Promise<SalonScope> => {
    const cached = scopes.get(salonId);
    if (cached && Date.now() - cached.at < SCOPE_TTL_MS) return cached.scope;
    const scope = (async () => {
      const store = createSupabaseStore(db, salonId);
      const salon = await store.salon.get();
      if (!salon.active) throw new Error(`El salón ${salonId} está inactivo`);
      return buildScope(shared, store, salon, messagingFor(env, salon, logger));
    })();
    scopes.set(salonId, { at: Date.now(), scope });
    scope.catch(() => scopes.delete(salonId));
    return scope;
  };

  logger.info("Slot Filler iniciado", { backend: env.DATA_BACKEND, demo: env.DEMO_MODE, messaging: env.MESSAGING_CHANNEL, nlu: nlu.name, calendar: env.CALENDAR_PROVIDER });
  return { env, logger, directory: createSupabaseDirectory(db), forSalon };
}

const globalForContainer = globalThis as unknown as { __slotFiller?: Container };

/** Contenedor único por proceso (sobrevive al hot reload de `next dev`). */
export function getContainer(): Container {
  globalForContainer.__slotFiller ??= buildContainer();
  return globalForContainer.__slotFiller;
}

/** Demo en memoria: el contexto del único salón (seed). */
export async function demoScope(): Promise<SalonScope> {
  const container = getContainer();
  if (!container.demo) throw new Error("Solo disponible en modo demo");
  return container.forSalon(container.demo.holder.db.salon.id);
}
