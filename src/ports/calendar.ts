/** Evento tal como vive en el calendario externo del estilista. */
export interface ExternalEvent {
  readonly id: string;
  readonly title: string;
  readonly start: string;
  readonly end: string;
  readonly status: "confirmed" | "cancelled";
  /** Id de la cita de Slot Filler si el evento lo creamos nosotros (extended private property). */
  readonly slotFillerId?: string;
  readonly updatedAt: string;
}

export interface EventDraft {
  readonly title: string;
  readonly description?: string;
  readonly start: string;
  readonly end: string;
  readonly slotFillerId: string;
}

export interface ChangeSet {
  readonly events: readonly ExternalEvent[];
  readonly nextSyncToken: string;
  /** El token expiró (410 en Google): hay que hacer un full sync. */
  readonly fullResyncRequired?: boolean;
}

export interface WatchChannel {
  readonly channelId: string;
  readonly resourceId: string;
  readonly expiresAt: string;
}

/** Calendario externo: fake en demo/tests, Google Calendar en producción. */
export interface CalendarProvider {
  readonly name: "fake" | "google";
  /** Cambios desde `syncToken` (o todo, si no hay token). */
  listChanges(calendarId: string, syncToken: string | undefined, refreshToken: string | undefined): Promise<ChangeSet>;
  upsertEvent(calendarId: string, externalId: string | undefined, draft: EventDraft, refreshToken: string | undefined): Promise<ExternalEvent>;
  deleteEvent(calendarId: string, externalId: string, refreshToken: string | undefined): Promise<void>;
  watch(calendarId: string, webhookUrl: string, refreshToken: string | undefined): Promise<WatchChannel>;
}
