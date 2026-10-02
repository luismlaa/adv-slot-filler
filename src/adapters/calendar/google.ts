import { z } from "zod";
import { zonedInstant } from "@/domain/time";
import type { CalendarProvider, ChangeSet, EventDraft, ExternalEvent, Logger, WatchChannel } from "@/ports";

const API = "https://www.googleapis.com/calendar/v3";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
/** Scope mínimo: leer y escribir eventos (no gestionar calendarios). Requiere verificación de app (D3). */
export const GOOGLE_SCOPE = "https://www.googleapis.com/auth/calendar.events";

export interface GoogleOAuthConfig {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly redirectUri: string;
}

const tokenSchema = z.object({ access_token: z.string(), expires_in: z.number(), refresh_token: z.string().optional() });

const timeSchema = z.object({ dateTime: z.string().optional(), date: z.string().optional() });
const eventSchema = z.object({
  id: z.string(),
  status: z.enum(["confirmed", "tentative", "cancelled"]),
  summary: z.string().optional(),
  start: timeSchema.optional(),
  end: timeSchema.optional(),
  updated: z.string().optional(),
  extendedProperties: z.object({ private: z.record(z.string(), z.string()).optional() }).optional(),
});
const listSchema = z.object({ items: z.array(eventSchema).default([]), nextPageToken: z.string().optional(), nextSyncToken: z.string().optional() });
const watchSchema = z.object({ resourceId: z.string(), expiration: z.string() });

/** URL de consentimiento: el estilista autoriza su calendario una vez; se guarda el refresh token. */
export function buildAuthUrl(config: GoogleOAuthConfig, state: string): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: GOOGLE_SCOPE,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `${AUTH_URL}?${params}`;
}

export async function exchangeCode(config: GoogleOAuthConfig, code: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  const response = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: config.clientId, client_secret: config.clientSecret, redirect_uri: config.redirectUri, grant_type: "authorization_code" }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Google OAuth: HTTP ${response.status}`);
  const token = tokenSchema.parse(await response.json());
  if (!token.refresh_token) throw new Error("Google no devolvió refresh token (¿falta prompt=consent?)");
  return token.refresh_token;
}

function toEvent(raw: z.infer<typeof eventSchema>, timezone: string): ExternalEvent | undefined {
  const status = raw.status === "cancelled" ? "cancelled" : "confirmed";
  const instant = (t: z.infer<typeof timeSchema> | undefined) =>
    t?.dateTime ? new Date(t.dateTime).toISOString() : t?.date ? new Date(zonedInstant(t.date, "00:00", timezone)).toISOString() : undefined;
  const start = instant(raw.start);
  const end = instant(raw.end);
  // Los eventos borrados llegan sin fechas en sync incremental: basta con el id.
  if (status === "confirmed" && (!start || !end)) return undefined;
  return {
    id: raw.id,
    title: raw.summary ?? "Ocupado",
    start: start ?? new Date(0).toISOString(),
    end: end ?? new Date(0).toISOString(),
    status,
    slotFillerId: raw.extendedProperties?.private?.slotFillerId,
    updatedAt: raw.updated ?? new Date().toISOString(),
  };
}

/**
 * Google Calendar API v3. Cada llamada obtiene un access token a partir del refresh token
 * del estilista (cacheado hasta que vence). Timeouts en todo; 410 en sync → full resync.
 */
export function createGoogleCalendarProvider(config: GoogleOAuthConfig, timezone: string, logger: Logger, fetchImpl: typeof fetch = fetch): CalendarProvider {
  const tokens = new Map<string, { token: string; expiresAt: number }>();

  const accessToken = async (refreshToken: string | undefined): Promise<string> => {
    if (!refreshToken) throw new Error("El estilista no ha conectado su Google Calendar");
    const cached = tokens.get(refreshToken);
    if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
    const response = await fetchImpl(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Google OAuth refresh: HTTP ${response.status}`);
    const token = tokenSchema.parse(await response.json());
    tokens.set(refreshToken, { token: token.access_token, expiresAt: Date.now() + token.expires_in * 1000 });
    return token.access_token;
  };

  const call = async (refreshToken: string | undefined, path: string, init: RequestInit = {}) =>
    fetchImpl(`${API}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${await accessToken(refreshToken)}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(15_000),
    });

  const eventsPath = (calendarId: string) => `/calendars/${encodeURIComponent(calendarId)}/events`;

  return {
    name: "google",

    async listChanges(calendarId, syncToken, refreshToken): Promise<ChangeSet> {
      const events: ExternalEvent[] = [];
      let pageToken: string | undefined;
      let nextSyncToken: string | undefined;
      do {
        const params = new URLSearchParams({ singleEvents: "true", showDeleted: "true", maxResults: "250" });
        if (syncToken) params.set("syncToken", syncToken);
        if (pageToken) params.set("pageToken", pageToken);
        const response = await call(refreshToken, `${eventsPath(calendarId)}?${params}`);
        if (response.status === 410) {
          logger.warn("Google Calendar: sync token vencido, se hará sync completo", { calendarId });
          return { events: [], nextSyncToken: "", fullResyncRequired: true };
        }
        if (!response.ok) throw new Error(`Google Calendar list: HTTP ${response.status}`);
        const page = listSchema.parse(await response.json());
        for (const raw of page.items) {
          const event = toEvent(raw, timezone);
          if (event) events.push(event);
        }
        pageToken = page.nextPageToken;
        nextSyncToken = page.nextSyncToken ?? nextSyncToken;
      } while (pageToken);
      return { events, nextSyncToken: nextSyncToken ?? syncToken ?? "" };
    },

    async upsertEvent(calendarId, externalId, draft: EventDraft, refreshToken) {
      const body = JSON.stringify({
        summary: draft.title,
        description: draft.description,
        start: { dateTime: draft.start },
        end: { dateTime: draft.end },
        extendedProperties: { private: { slotFillerId: draft.slotFillerId } },
        reminders: { useDefault: true },
      });
      const response = externalId
        ? await call(refreshToken, `${eventsPath(calendarId)}/${encodeURIComponent(externalId)}`, { method: "PATCH", body })
        : await call(refreshToken, eventsPath(calendarId), { method: "POST", body });
      if (!response.ok) throw new Error(`Google Calendar upsert: HTTP ${response.status}`);
      const event = toEvent(eventSchema.parse(await response.json()), timezone);
      if (!event) throw new Error("Google Calendar devolvió un evento sin fechas");
      return event;
    },

    async deleteEvent(calendarId, externalId, refreshToken) {
      const response = await call(refreshToken, `${eventsPath(calendarId)}/${encodeURIComponent(externalId)}`, { method: "DELETE" });
      if (!response.ok && response.status !== 404 && response.status !== 410) throw new Error(`Google Calendar delete: HTTP ${response.status}`);
    },

    async watch(calendarId, webhookUrl, refreshToken): Promise<WatchChannel> {
      const channelId = crypto.randomUUID();
      const response = await call(refreshToken, `${eventsPath(calendarId)}/watch`, {
        method: "POST",
        body: JSON.stringify({ id: channelId, type: "web_hook", address: webhookUrl }),
      });
      if (!response.ok) throw new Error(`Google Calendar watch: HTTP ${response.status}`);
      const watch = watchSchema.parse(await response.json());
      return { channelId, resourceId: watch.resourceId, expiresAt: new Date(Number(watch.expiration)).toISOString() };
    },
  };
}
