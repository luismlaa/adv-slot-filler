import type { Clock, DomainEvent, EventBus, IdGenerator } from "@/ports";

/** Reloj del sistema (producción). */
export const systemClock: Clock = { now: () => Date.now() };

/** Reloj de la demo: arranca en un instante fijo y avanza solo cuando el presentador lo pide (o en tiempo real). */
export class SimulatedClock implements Clock {
  private offset: number;
  private readonly realStart: number;

  constructor(
    private start: number,
    private readonly running = true,
    private readonly realNow: () => number = Date.now,
  ) {
    this.realStart = realNow();
    this.offset = 0;
  }

  now(): number {
    const elapsed = this.running ? this.realNow() - this.realStart : 0;
    return this.start + this.offset + elapsed;
  }

  advance(ms: number): number {
    this.offset += ms;
    return this.now();
  }

  /** Salta a un instante concreto (ej. "jueves 10:00"). */
  set(instant: number): number {
    this.offset = 0;
    this.start = instant - (this.running ? this.realNow() - this.realStart : 0);
    return this.now();
  }
}

export const randomIds: IdGenerator = { newId: () => crypto.randomUUID() };

/** Bus en memoria: alimenta los streams SSE de la demo. */
export class InMemoryEventBus implements EventBus {
  private readonly handlers = new Set<(event: DomainEvent) => void>();

  publish(event: DomainEvent): void {
    for (const handler of this.handlers) {
      try {
        handler(event);
      } catch {
        // Un suscriptor caído (pestaña cerrada) no debe tumbar al resto.
      }
    }
  }

  subscribe(handler: (event: DomainEvent) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }
}
