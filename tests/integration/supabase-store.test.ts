import { afterAll, describe, it } from "vitest";
import { createServiceClient } from "@/adapters/supabase/client";
import { createSupabaseStore } from "@/adapters/supabase/store";
import { toRow } from "@/adapters/supabase/rows";
import { contractFixture, runStoreContract } from "../contract/store.contract";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  describe.skip("Store contract — supabase (sin NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)", () => {
    it("requiere `npx supabase start`", () => undefined);
  });
} else {
  const db = createServiceClient(url, key);
  const created: string[] = [];
  let run = 0;

  runStoreContract("supabase", async () => {
    run += 1;
    const salonId = `contract-${Date.now()}-${run}`;
    const fixture = contractFixture(salonId);
    created.push(salonId);
    const inserts: [string, object[]][] = [
      ["salons", [fixture.salon]],
      ["specialties", fixture.specialties.map((s) => ({ ...s, salonId }))],
      ["staff", [...fixture.staff]],
      ["services", [...fixture.services]],
      ["clients", [...fixture.clients]],
    ];
    for (const [table, rows] of inserts) {
      const { error } = await db.from(table).insert(rows.map(toRow));
      if (error) throw new Error(`${table}: ${error.message}`);
    }
    return { store: createSupabaseStore(db, salonId), fixture };
  });

  afterAll(async () => {
    if (created.length > 0) await db.from("salons").delete().in("id", created);
  });
}
