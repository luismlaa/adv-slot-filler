import type {
  Activity,
  Appointment,
  Block,
  CalendarLink,
  Client,
  ConversationRecord,
  Gap,
  Message,
  Nudge,
  Offer,
  Salon,
  Service,
  Specialty,
  Staff,
  WaitlistEntry,
} from "@/domain/model";
import type { AppointmentFilter, Store } from "@/ports";

/** Estado completo de un salón en memoria. Los registros son inmutables; se reemplazan, nunca se mutan. */
export interface MemoryDb {
  readonly salon: Salon;
  readonly specialties: readonly Specialty[];
  readonly staff: readonly Staff[];
  readonly services: readonly Service[];
  readonly clients: readonly Client[];
  readonly appointments: readonly Appointment[];
  readonly blocks: readonly Block[];
  readonly waitlist: readonly WaitlistEntry[];
  readonly gaps: readonly Gap[];
  readonly offers: readonly Offer[];
  readonly nudges: readonly Nudge[];
  readonly messages: readonly Message[];
  readonly conversations: readonly ConversationRecord[];
  readonly calendarLinks: readonly CalendarLink[];
  readonly activity: readonly Activity[];
}

/** Contenedor mutable de la referencia a la base (permite reset de la demo). */
export interface MemoryHolder {
  db: MemoryDb;
}

const overlapsRange = (start: string, end: string, from?: string, to?: string) =>
  (to === undefined || start < to) && (from === undefined || end > from);

const replaceWhere = <T>(list: readonly T[], match: (item: T) => boolean, next: (item: T) => T): readonly T[] =>
  list.map((item) => (match(item) ? next(item) : item));

const ACTIVITY_CAP = 500;

/**
 * Store en memoria. Cada operación es síncrona dentro de su promesa (no hay `await` entre leer y
 * escribir), por eso los compare-and-set son atómicos en el event loop de Node.
 */
export function createMemoryStore(holder: MemoryHolder): Store {
  const db = () => holder.db;
  const set = (patch: Partial<MemoryDb>) => {
    holder.db = { ...holder.db, ...patch };
  };

  return {
    get salonId() {
      return holder.db.salon.id;
    },

    salon: {
      get: async () => db().salon,
      updateSettings: async (settings) => {
        const salon = { ...db().salon, settings };
        set({ salon });
        return salon;
      },
    },

    specialties: {
      list: async () => [...db().specialties],
    },

    staff: {
      list: async () => [...db().staff],
      upsert: async (staff) => {
        const exists = db().staff.some((s) => s.id === staff.id);
        set({ staff: exists ? replaceWhere(db().staff, (s) => s.id === staff.id, () => staff) : [...db().staff, staff] });
        return staff;
      },
    },

    services: {
      list: async () => [...db().services],
      upsert: async (service) => {
        const exists = db().services.some((s) => s.id === service.id);
        set({ services: exists ? replaceWhere(db().services, (s) => s.id === service.id, () => service) : [...db().services, service] });
        return service;
      },
    },

    clients: {
      list: async () => [...db().clients],
      get: async (id) => db().clients.find((c) => c.id === id),
      findByPhone: async (phone) => db().clients.find((c) => c.phone === phone),
      insert: async (client) => {
        set({ clients: [...db().clients, client] });
        return client;
      },
      update: async (id, patch) => {
        const current = db().clients.find((c) => c.id === id);
        if (!current) return undefined;
        const next = { ...current, ...patch };
        set({ clients: replaceWhere(db().clients, (c) => c.id === id, () => next) });
        return next;
      },
    },

    appointments: {
      list: async (filter: AppointmentFilter = {}) =>
        db().appointments.filter(
          (a) =>
            overlapsRange(a.start, a.end, filter.from, filter.to) &&
            (filter.clientId === undefined || a.clientId === filter.clientId) &&
            (filter.staffId === undefined || a.staffId === filter.staffId) &&
            (filter.statuses === undefined || filter.statuses.includes(a.status)),
        ),
      get: async (id) => db().appointments.find((a) => a.id === id),
      insertIfFree: async (appointment) => {
        const clash = db().appointments.some(
          (a) =>
            a.staffId === appointment.staffId &&
            (a.status === "booked" || a.status === "completed") &&
            a.start < appointment.end &&
            appointment.start < a.end,
        );
        if (clash) return { ok: false, reason: "conflict" };
        set({ appointments: [...db().appointments, appointment] });
        return { ok: true, value: appointment };
      },
      transition: async (id, from, patch) => {
        const current = db().appointments.find((a) => a.id === id);
        if (!current || !from.includes(current.status)) return undefined;
        const next = { ...current, ...patch };
        set({ appointments: replaceWhere(db().appointments, (a) => a.id === id, () => next) });
        return next;
      },
      update: async (id, patch) => {
        const current = db().appointments.find((a) => a.id === id);
        if (!current) return undefined;
        const next = { ...current, ...patch };
        set({ appointments: replaceWhere(db().appointments, (a) => a.id === id, () => next) });
        return next;
      },
    },

    blocks: {
      list: async (filter = {}) =>
        db().blocks.filter(
          (b) => overlapsRange(b.start, b.end, filter.from, filter.to) && (filter.staffId === undefined || b.staffId === filter.staffId),
        ),
      upsert: async (block) => {
        const exists = db().blocks.some((b) => b.id === block.id);
        set({ blocks: exists ? replaceWhere(db().blocks, (b) => b.id === block.id, () => block) : [...db().blocks, block] });
        return block;
      },
      delete: async (id) => set({ blocks: db().blocks.filter((b) => b.id !== id) }),
    },

    waitlist: {
      list: async (statuses) => db().waitlist.filter((w) => statuses === undefined || statuses.includes(w.status)),
      insert: async (entry) => {
        set({ waitlist: [...db().waitlist, entry] });
        return entry;
      },
      update: async (id, patch) => {
        const current = db().waitlist.find((w) => w.id === id);
        if (!current) return undefined;
        const next = { ...current, ...patch };
        set({ waitlist: replaceWhere(db().waitlist, (w) => w.id === id, () => next) });
        return next;
      },
    },

    gaps: {
      list: async (statuses) => db().gaps.filter((g) => statuses === undefined || statuses.includes(g.status)),
      get: async (id) => db().gaps.find((g) => g.id === id),
      insert: async (gap) => {
        set({ gaps: [...db().gaps, gap] });
        return gap;
      },
      transition: async (id, from, patch) => {
        const current = db().gaps.find((g) => g.id === id);
        if (!current || current.status !== from) return undefined;
        const next = { ...current, ...patch };
        set({ gaps: replaceWhere(db().gaps, (g) => g.id === id, () => next) });
        return next;
      },
    },

    offers: {
      list: async (filter = {}) =>
        db().offers.filter(
          (o) =>
            (filter.gapId === undefined || o.gapId === filter.gapId) &&
            (filter.clientId === undefined || o.clientId === filter.clientId) &&
            (filter.statuses === undefined || filter.statuses.includes(o.status)) &&
            (filter.sentAfter === undefined || o.sentAt > filter.sentAfter),
        ),
      get: async (id) => db().offers.find((o) => o.id === id),
      insertMany: async (offers) => {
        // Igual que `unique (gap_id, client_id)` en Postgres: reintentos no duplican ofertas.
        const fresh = offers.filter((o) => !db().offers.some((e) => e.gapId === o.gapId && e.clientId === o.clientId));
        set({ offers: [...db().offers, ...fresh] });
        return fresh;
      },
      transition: async (id, from, patch) => {
        const current = db().offers.find((o) => o.id === id);
        if (!current || current.status !== from) return undefined;
        const next = { ...current, ...patch };
        set({ offers: replaceWhere(db().offers, (o) => o.id === id, () => next) });
        return next;
      },
    },

    nudges: {
      list: async (filter = {}) =>
        db().nudges.filter(
          (n) => (filter.clientId === undefined || n.clientId === filter.clientId) && (filter.statuses === undefined || filter.statuses.includes(n.status)),
        ),
      insert: async (nudge) => {
        set({ nudges: [...db().nudges, nudge] });
        return nudge;
      },
      update: async (id, patch) => {
        const current = db().nudges.find((n) => n.id === id);
        if (!current) return undefined;
        const next = { ...current, ...patch };
        set({ nudges: replaceWhere(db().nudges, (n) => n.id === id, () => next) });
        return next;
      },
    },

    messages: {
      list: async (filter = {}) => {
        const matching = db().messages.filter((m) => filter.phone === undefined || m.phone === filter.phone);
        return filter.limit === undefined ? matching : matching.slice(-filter.limit);
      },
      insert: async (message) => {
        set({ messages: [...db().messages, message] });
        return message;
      },
      existsProviderId: async (providerMessageId) => db().messages.some((m) => m.providerMessageId === providerMessageId),
    },

    conversations: {
      get: async (phone) => db().conversations.find((c) => c.phone === phone),
      save: async (record) => {
        set({ conversations: [...db().conversations.filter((c) => c.phone !== record.phone), record] });
      },
    },

    calendarLinks: {
      list: async () => [...db().calendarLinks],
      get: async (staffId) => db().calendarLinks.find((l) => l.staffId === staffId),
      upsert: async (link) => {
        set({ calendarLinks: [...db().calendarLinks.filter((l) => l.staffId !== link.staffId), link] });
        return link;
      },
    },

    activity: {
      list: async (limit = 50) => [...db().activity].sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit),
      insert: async (entry) => {
        set({ activity: [...db().activity, entry].slice(-ACTIVITY_CAP) });
        return entry;
      },
    },
  };
}
