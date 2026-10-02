import type { BusinessConfig } from "@/config/business";
import type { Appointment } from "@/domain/model";
import type { LLMProvider } from "@/nlu/types";
import type { Clock, EventBus, IdGenerator, Logger, MessagingChannel, Store } from "@/ports";

/** Ganchos para reflejar citas en calendarios externos (sync bidireccional, F6). */
export interface CalendarHooks {
  appointmentChanged(appointment: Appointment): Promise<void>;
}

/** Todo lo que un caso de uso necesita. Se arma una vez en `src/lib/container.ts`. */
export interface AppContext {
  readonly store: Store;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly bus: EventBus;
  readonly logger: Logger;
  readonly messaging: MessagingChannel;
  readonly nlu: LLMProvider;
  readonly calendar?: CalendarHooks;
  /** Config de negocio ya mezclada con los overrides del salón. */
  config(): Promise<BusinessConfig>;
}
