import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * Las migraciones se aplican de verdad sobre Postgres (PGlite, en proceso, sin Docker) y se prueba
 * el aislamiento entre salones que impone la base. Lo propio de Supabase (auth, roles, publicación
 * de Realtime) se simula con lo mínimo.
 */
const SUPABASE_PRELUDE = `
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  create role authenticated;
  create role anon;
  grant usage on schema public, auth to authenticated;
  grant execute on function auth.uid() to authenticated;
  create publication supabase_realtime;
  -- Como Supabase: los roles de la API tienen privilegios sobre public; RLS decide las filas.
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on functions to anon, authenticated;
`;

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");
const OWNER_A = "00000000-0000-0000-0000-00000000000a";

describe("migraciones de Supabase", () => {
  const db = new PGlite({ extensions: { btree_gist } });

  beforeAll(async () => {
    await db.exec(SUPABASE_PRELUDE);
    for (const file of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort()) {
      await db.exec(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
    }
    await db.exec(`
      insert into auth.users (id) values ('${OWNER_A}');
      insert into salons (id, name, slug, whatsapp_phone_number_id) values ('salon-a', 'A', 'a', 'wa-a'), ('salon-b', 'B', 'b', null);
      insert into salon_members (salon_id, user_id, role) values ('salon-a', '${OWNER_A}', 'owner');
      insert into staff (id, salon_id, name, schedule, color) values ('staff-a', 'salon-a', 'Carlos', '[]', '#0f766e');
      insert into services (id, salon_id, name, category, duration_minutes, price, default_cycle_days) values ('svc-a', 'salon-a', 'Fade', 'corte', 45, 700, 28), ('svc-b', 'salon-b', 'Fade', 'corte', 45, 700, 28);
      insert into clients (id, salon_id, name, phone) values ('client-b', 'salon-b', 'Juan', '+18095550104');
    `);
  }, 60_000);

  it("se aplican todas, en orden, sin errores", async () => {
    const { rows } = await db.query<{ column_name: string }>(
      "select column_name from information_schema.columns where table_name = 'salons' and column_name in ('slug', 'active', 'whatsapp_phone_number_id')",
    );
    expect(rows.map((r) => r.column_name).sort()).toEqual(["active", "slug", "whatsapp_phone_number_id"]);
  });

  it("una cita no puede apuntar al estilista de otro salón", async () => {
    await expect(
      db.exec(`insert into appointments (salon_id, client_id, staff_id, service_id, start_at, end_at, status, source, price)
               values ('salon-b', 'client-b', 'staff-a', 'svc-b', now(), now() + interval '45 minutes', 'booked', 'salon', 700)`),
    ).rejects.toThrow(/appointments_staff_same_salon/);
  });

  it("un número de WhatsApp pertenece a un solo salón", async () => {
    await expect(db.exec("update salons set whatsapp_phone_number_id = 'wa-a' where id = 'salon-b'")).rejects.toThrow(/duplicate key/);
  });

  it("un miembro edita los datos de su salón, pero no el número de WhatsApp ni el estado", async () => {
    await db.exec(`set test.uid = '${OWNER_A}'; set role authenticated;`);
    try {
      await db.exec("update salons set address = 'Piantini' where id = 'salon-a'");
      await expect(db.exec("update salons set whatsapp_phone_number_id = 'robado' where id = 'salon-a'")).rejects.toThrow(/permission denied/);
      await expect(db.exec("update salons set active = false where id = 'salon-a'")).rejects.toThrow(/permission denied/);
    } finally {
      await db.exec("reset role; reset test.uid;");
    }
    const { rows } = await db.query<{ address: string }>("select address from salons where id = 'salon-a'");
    expect(rows[0]?.address).toBe("Piantini");
  });
});
