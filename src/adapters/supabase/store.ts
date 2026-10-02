import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  activitySchema,
  appointmentSchema,
  blockSchema,
  calendarLinkSchema,
  clientSchema,
  conversationRecordSchema,
  gapSchema,
  messageSchema,
  nudgeSchema,
  offerSchema,
  salonSchema,
  serviceSchema,
  specialtySchema,
  staffSchema,
  waitlistEntrySchema,
} from "@/domain/model";
import type { Store } from "@/ports";
import { TABLES, fromRow, toPatch, toRow } from "./rows";

type Row = Record<string, unknown>;

/** Postgres: violación de exclusion constraint (cita solapada). */
const EXCLUSION_VIOLATION = "23P01";

function unwrap<T>(result: { data: T | null; error: PostgrestError | null }, what: string): T {
  if (result.error) throw new Error(`Supabase (${what}): ${result.error.message}`);
  if (result.data === null) throw new Error(`Supabase (${what}): sin datos`);
  return result.data;
}

const rows = (data: unknown): Row[] => (Array.isArray(data) ? (data as Row[]) : []);

/**
 * Store sobre Supabase (Postgres + PostgREST). Usa la service role key: corre solo en el servidor.
 * Los compare-and-set se expresan como `update … where status = from returning *`.
 */
export function createSupabaseStore(db: SupabaseClient, salonId: string): Store {
  const table = (name: (typeof TABLES)[keyof typeof TABLES]) => db.from(name);
  const scoped = (name: (typeof TABLES)[keyof typeof TABLES]) => table(name).select("*").eq("salon_id", salonId);
  const many = async <S extends z.ZodType>(schema: S, query: PromiseLike<{ data: unknown; error: PostgrestError | null }>, what: string, numeric: string[] = []) => {
    const result = await query;
    if (result.error) throw new Error(`Supabase (${what}): ${result.error.message}`);
    return rows(result.data).map((r) => fromRow(schema, r, numeric));
  };
  const maybeOne = async <S extends z.ZodType>(schema: S, query: PromiseLike<{ data: unknown; error: PostgrestError | null }>, what: string, numeric: string[] = []) => {
    const result = await query;
    if (result.error) throw new Error(`Supabase (${what}): ${result.error.message}`);
    return result.data ? fromRow(schema, result.data as Row, numeric) : undefined;
  };
  const MONEY = ["price"];

  /**
   * Upsert acotado al salón. El service role salta RLS, así que un `upsert` por id podría pisar la fila
   * de OTRO salón con un id ajeno. Primero se actualiza solo si la fila es de este salón; si no existe,
   * se inserta — y si el id es de otro salón, el insert choca con la clave primaria y falla.
   */
  const scopedUpsert = async (name: (typeof TABLES)[keyof typeof TABLES], row: Row, key: string, what: string): Promise<Row> => {
    if (row.salon_id !== salonId) throw new Error(`Supabase (${what}): la fila no pertenece a este salón`);
    const updated = await table(name).update(row).eq("salon_id", salonId).eq(key, row[key] as string).select().maybeSingle();
    if (updated.error) throw new Error(`Supabase (${what}): ${updated.error.message}`);
    if (updated.data) return updated.data as Row;
    return unwrap(await table(name).insert(row).select().single(), what) as Row;
  };

  return {
    salonId,

    salon: {
      get: async () => fromRow(salonSchema, unwrap(await table(TABLES.salons).select("id,name,timezone,currency,phone,address,settings,slug,active,whatsapp_phone_number_id").eq("id", salonId).single(), "salon")),
      updateSettings: async (settings) =>
        fromRow(salonSchema, unwrap(await table(TABLES.salons).update({ settings }).eq("id", salonId).select("id,name,timezone,currency,phone,address,settings,slug,active,whatsapp_phone_number_id").single(), "salon.update")),
    },

    specialties: {
      list: async () => many(specialtySchema, table(TABLES.specialties).select("id,name").eq("salon_id", salonId), "specialties"),
    },

    staff: {
      list: () => many(staffSchema, scoped(TABLES.staff).order("name"), "staff"),
      upsert: async (s) => fromRow(staffSchema, await scopedUpsert(TABLES.staff, toRow(s), "id", "staff.upsert")),
    },

    services: {
      list: () => many(serviceSchema, scoped(TABLES.services).order("name"), "services", MONEY),
      upsert: async (s) => fromRow(serviceSchema, await scopedUpsert(TABLES.services, toRow(s), "id", "services.upsert"), MONEY),
    },

    clients: {
      list: () => many(clientSchema, scoped(TABLES.clients).order("name"), "clients"),
      get: (id) => maybeOne(clientSchema, scoped(TABLES.clients).eq("id", id).maybeSingle(), "clients.get"),
      findByPhone: (phone) => maybeOne(clientSchema, scoped(TABLES.clients).eq("phone", phone).maybeSingle(), "clients.findByPhone"),
      insert: async (c) => fromRow(clientSchema, unwrap(await table(TABLES.clients).insert(toRow(c)).select().single(), "clients.insert")),
      update: (id, patch) => maybeOne(clientSchema, table(TABLES.clients).update(toPatch(patch)).eq("salon_id", salonId).eq("id", id).select().maybeSingle(), "clients.update"),
    },

    appointments: {
      list: (filter = {}) => {
        let q = scoped(TABLES.appointments);
        if (filter.to !== undefined) q = q.lt("start_at", filter.to);
        if (filter.from !== undefined) q = q.gt("end_at", filter.from);
        if (filter.clientId !== undefined) q = q.eq("client_id", filter.clientId);
        if (filter.staffId !== undefined) q = q.eq("staff_id", filter.staffId);
        if (filter.statuses !== undefined) q = q.in("status", [...filter.statuses]);
        return many(appointmentSchema, q.order("start_at"), "appointments.list", MONEY);
      },
      get: (id) => maybeOne(appointmentSchema, scoped(TABLES.appointments).eq("id", id).maybeSingle(), "appointments.get", MONEY),
      insertIfFree: async (appointment) => {
        const result = await table(TABLES.appointments).insert(toRow(appointment)).select().single();
        if (result.error?.code === EXCLUSION_VIOLATION) return { ok: false, reason: "conflict" };
        return { ok: true, value: fromRow(appointmentSchema, unwrap(result, "appointments.insert"), MONEY) };
      },
      transition: (id, from, patch) =>
        maybeOne(
          appointmentSchema,
          table(TABLES.appointments).update(toPatch(patch)).eq("salon_id", salonId).eq("id", id).in("status", [...from]).select().maybeSingle(),
          "appointments.transition",
          MONEY,
        ),
      update: (id, patch) =>
        maybeOne(appointmentSchema, table(TABLES.appointments).update(toPatch(patch)).eq("salon_id", salonId).eq("id", id).select().maybeSingle(), "appointments.update", MONEY),
    },

    blocks: {
      list: (filter = {}) => {
        let q = scoped(TABLES.blocks);
        if (filter.to !== undefined) q = q.lt("start_at", filter.to);
        if (filter.from !== undefined) q = q.gt("end_at", filter.from);
        if (filter.staffId !== undefined) q = q.eq("staff_id", filter.staffId);
        return many(blockSchema, q.order("start_at"), "blocks.list");
      },
      upsert: async (b) => fromRow(blockSchema, await scopedUpsert(TABLES.blocks, toRow(b), "id", "blocks.upsert")),
      delete: async (id) => {
        const { error } = await table(TABLES.blocks).delete().eq("salon_id", salonId).eq("id", id);
        if (error) throw new Error(`Supabase (blocks.delete): ${error.message}`);
      },
    },

    waitlist: {
      list: (statuses) => {
        const q = scoped(TABLES.waitlist);
        return many(waitlistEntrySchema, (statuses ? q.in("status", [...statuses]) : q).order("created_at"), "waitlist.list");
      },
      insert: async (e) => fromRow(waitlistEntrySchema, unwrap(await table(TABLES.waitlist).insert(toRow(e)).select().single(), "waitlist.insert")),
      update: (id, patch) =>
        maybeOne(waitlistEntrySchema, table(TABLES.waitlist).update(toPatch(patch)).eq("salon_id", salonId).eq("id", id).select().maybeSingle(), "waitlist.update"),
    },

    gaps: {
      list: (statuses) => {
        const q = scoped(TABLES.gaps);
        return many(gapSchema, (statuses ? q.in("status", [...statuses]) : q).order("created_at"), "gaps.list");
      },
      get: (id) => maybeOne(gapSchema, scoped(TABLES.gaps).eq("id", id).maybeSingle(), "gaps.get"),
      insert: async (g) => fromRow(gapSchema, unwrap(await table(TABLES.gaps).insert(toRow(g)).select().single(), "gaps.insert")),
      transition: (id, from, patch) =>
        maybeOne(gapSchema, table(TABLES.gaps).update(toPatch(patch)).eq("salon_id", salonId).eq("id", id).eq("status", from).select().maybeSingle(), "gaps.transition"),
    },

    offers: {
      list: (filter = {}) => {
        let q = scoped(TABLES.offers);
        if (filter.gapId !== undefined) q = q.eq("gap_id", filter.gapId);
        if (filter.clientId !== undefined) q = q.eq("client_id", filter.clientId);
        if (filter.statuses !== undefined) q = q.in("status", [...filter.statuses]);
        if (filter.sentAfter !== undefined) q = q.gt("sent_at", filter.sentAfter);
        return many(offerSchema, q.order("sent_at"), "offers.list", ["score"]);
      },
      get: (id) => maybeOne(offerSchema, scoped(TABLES.offers).eq("id", id).maybeSingle(), "offers.get", ["score"]),
      insertMany: async (offers) => {
        if (offers.length === 0) return [];
        // on conflict (gap_id, client_id) do nothing → reintentos de un job no duplican ofertas.
        const result = await table(TABLES.offers).upsert(offers.map(toRow), { onConflict: "gap_id,client_id", ignoreDuplicates: true }).select();
        if (result.error) throw new Error(`Supabase (offers.insert): ${result.error.message}`);
        return rows(result.data).map((r) => fromRow(offerSchema, r, ["score"]));
      },
      transition: (id, from, patch) =>
        maybeOne(offerSchema, table(TABLES.offers).update(toPatch(patch)).eq("salon_id", salonId).eq("id", id).eq("status", from).select().maybeSingle(), "offers.transition", ["score"]),
    },

    nudges: {
      list: (filter = {}) => {
        let q = scoped(TABLES.nudges);
        if (filter.clientId !== undefined) q = q.eq("client_id", filter.clientId);
        if (filter.statuses !== undefined) q = q.in("status", [...filter.statuses]);
        return many(nudgeSchema, q.order("sent_at"), "nudges.list");
      },
      insert: async (n) => fromRow(nudgeSchema, unwrap(await table(TABLES.nudges).insert(toRow(n)).select().single(), "nudges.insert")),
      update: (id, patch) =>
        maybeOne(nudgeSchema, table(TABLES.nudges).update(toPatch(patch)).eq("salon_id", salonId).eq("id", id).select().maybeSingle(), "nudges.update"),
    },

    messages: {
      list: async (filter = {}) => {
        let q = scoped(TABLES.messages);
        if (filter.phone !== undefined) q = q.eq("phone", filter.phone);
        const list = await many(messageSchema, q.order("at", { ascending: false }).limit(filter.limit ?? 500), "messages.list");
        return list.reverse();
      },
      insert: async (m) => fromRow(messageSchema, unwrap(await table(TABLES.messages).insert(toRow(m)).select().single(), "messages.insert")),
      existsProviderId: async (providerMessageId) => {
        const { count, error } = await table(TABLES.messages).select("id", { count: "exact", head: true }).eq("provider_message_id", providerMessageId);
        if (error) throw new Error(`Supabase (messages.exists): ${error.message}`);
        return (count ?? 0) > 0;
      },
    },

    conversations: {
      get: (phone) => maybeOne(conversationRecordSchema, scoped(TABLES.conversations).eq("phone", phone).maybeSingle(), "conversations.get"),
      save: async (record) => {
        const { error } = await table(TABLES.conversations).upsert(toRow(record), { onConflict: "salon_id,phone" });
        if (error) throw new Error(`Supabase (conversations.save): ${error.message}`);
      },
    },

    calendarLinks: {
      list: () => many(calendarLinkSchema, scoped(TABLES.calendarLinks), "calendarLinks.list"),
      get: (staffId) => maybeOne(calendarLinkSchema, scoped(TABLES.calendarLinks).eq("staff_id", staffId).maybeSingle(), "calendarLinks.get"),
      upsert: async (link) => fromRow(calendarLinkSchema, await scopedUpsert(TABLES.calendarLinks, toRow(link), "staff_id", "calendarLinks.upsert")),
    },

    activity: {
      list: (limit = 50) => many(activitySchema, scoped(TABLES.activity).order("at", { ascending: false }).limit(limit), "activity.list"),
      insert: async (a) => fromRow(activitySchema, unwrap(await table(TABLES.activity).insert(toRow(a)).select().single(), "activity.insert")),
    },
  };
}
