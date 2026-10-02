import type { Id } from "@/domain/model";

export interface Clock {
  now(): number;
}

export interface IdGenerator {
  newId(): Id;
}

export type DomainEventType =
  | "appointment.booked"
  | "appointment.cancelled"
  | "appointment.updated"
  | "gap.opened"
  | "gap.filled"
  | "gap.expired"
  | "offer.sent"
  | "offer.accepted"
  | "offer.declined"
  | "offer.expired"
  | "nudge.sent"
  | "message.in"
  | "message.out"
  | "block.changed"
  | "waitlist.changed"
  | "calendar.synced"
  | "activity"
  | "clock.changed"
  | "demo.reset";

export interface DomainEvent {
  readonly type: DomainEventType;
  readonly salonId: Id;
  readonly at: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

/** Bus de eventos en vivo: SSE en la demo, Supabase Realtime en producción. */
export interface EventBus {
  publish(event: DomainEvent): void;
  subscribe(handler: (event: DomainEvent) => void): () => void;
}

export type LogContext = Readonly<Record<string, unknown>>;

/** Logger estructurado: cada línea lleva contexto de negocio (salón, cliente, cita, motivo). */
export interface Logger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
  child(context: LogContext): Logger;
}
