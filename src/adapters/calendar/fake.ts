import type { CalendarProvider, ChangeSet, EventDraft, ExternalEvent, WatchChannel } from "@/ports";

interface StoredEvent extends ExternalEvent {
  readonly seq: number;
}

/** Quita el contador interno de versión antes de exponer el evento. */
const publicEvent = (e: StoredEvent): ExternalEvent => ({ id: e.id, title: e.title, start: e.start, end: e.end, status: e.status, slotFillerId: e.slotFillerId, updatedAt: e.updatedAt });

export interface FakeCalendarState {
  seq: number;
  calendars: Map<string, StoredEvent[]>;
}

/**
 * Calendario en memoria con la misma semántica que Google: sync incremental por token,
 * borrados como `cancelled`, propiedad privada con el id de la cita de Slot Filler.
 * La demo lo usa para simular que el estilista edita su propio Google Calendar.
 */
export class FakeCalendarProvider implements CalendarProvider {
  readonly name = "fake" as const;
  private state: FakeCalendarState = { seq: 0, calendars: new Map() };

  constructor(private readonly now: () => number = Date.now) {}

  reset(): void {
    this.state = { seq: 0, calendars: new Map() };
  }

  private list(calendarId: string): StoredEvent[] {
    const events = this.state.calendars.get(calendarId) ?? [];
    this.state.calendars.set(calendarId, events);
    return events;
  }

  private write(calendarId: string, event: Omit<StoredEvent, "seq" | "updatedAt">): StoredEvent {
    this.state.seq += 1;
    const stored: StoredEvent = { ...event, seq: this.state.seq, updatedAt: new Date(this.now()).toISOString() };
    const events = this.list(calendarId).filter((e) => e.id !== event.id);
    this.state.calendars.set(calendarId, [...events, stored]);
    return stored;
  }

  async listChanges(calendarId: string, syncToken: string | undefined): Promise<ChangeSet> {
    const since = syncToken === undefined ? 0 : Number(syncToken);
    const events = this.list(calendarId)
      .filter((e) => e.seq > since)
      .filter((e) => syncToken !== undefined || e.status !== "cancelled");
    return { events: events.map(publicEvent), nextSyncToken: String(this.state.seq) };
  }

  async upsertEvent(calendarId: string, externalId: string | undefined, draft: EventDraft): Promise<ExternalEvent> {
    const id = externalId ?? `evt-${this.state.seq + 1}`;
    return publicEvent(this.write(calendarId, { id, title: draft.title, start: draft.start, end: draft.end, status: "confirmed", slotFillerId: draft.slotFillerId }));
  }

  async deleteEvent(calendarId: string, externalId: string): Promise<void> {
    const current = this.list(calendarId).find((e) => e.id === externalId);
    if (current) this.write(calendarId, { ...current, status: "cancelled" });
  }

  async watch(calendarId: string): Promise<WatchChannel> {
    return { channelId: `fake-channel-${calendarId}`, resourceId: calendarId, expiresAt: new Date(this.now() + 7 * 86_400_000).toISOString() };
  }

  // ─── Lo que hace "el estilista" en su propio calendario (solo demo) ───

  addPersonalEvent(calendarId: string, event: { title: string; start: string; end: string }): ExternalEvent {
    return publicEvent(this.write(calendarId, { id: `personal-${this.state.seq + 1}`, ...event, status: "confirmed" }));
  }

  removeEvent(calendarId: string, eventId: string): void {
    const current = this.list(calendarId).find((e) => e.id === eventId);
    if (current) this.write(calendarId, { ...current, status: "cancelled" });
  }

  /** Eventos vigentes de un rango (lo que se vería abriendo Google Calendar). */
  visibleEvents(calendarId: string, from: string, to: string): ExternalEvent[] {
    return this.list(calendarId)
      .filter((e) => e.status === "confirmed" && e.start < to && e.end > from)
      .sort((a, b) => a.start.localeCompare(b.start))
      .map(publicEvent);
  }
}
