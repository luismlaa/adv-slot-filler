/**
 * Carga el salón de demo en Supabase (local o staging) para probar DATA_BACKEND=supabase.
 * Uso: NEXT_PUBLIC_SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… npx tsx scripts/seed-supabase.ts
 * Luego: SALON_ID=salon-el-clasico DATA_BACKEND=supabase npm run dev
 */
import { seedDemo } from "@/adapters/memory/seed";
import { createServiceClient } from "@/adapters/supabase/client";
import { toRow } from "@/adapters/supabase/rows";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY");
  const db = createServiceClient(url, key, 60_000);
  const { db: data } = seedDemo({ anchor: Date.now() });
  const salonId = data.salon.id;

  await db.from("salons").delete().eq("id", salonId);
  const batches: [string, readonly object[]][] = [
    ["salons", [data.salon]],
    ["specialties", data.specialties.map((s) => ({ ...s, salonId }))],
    ["staff", data.staff],
    ["services", data.services],
    ["clients", data.clients],
    ["appointments", data.appointments],
    ["waitlist_entries", data.waitlist],
    ["gaps", data.gaps],
    ["offers", data.offers],
    ["nudges", data.nudges],
    ["messages", data.messages],
  ];
  for (const [table, rows] of batches) {
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await db.from(table).insert(rows.slice(i, i + 500).map(toRow));
      if (error) throw new Error(`${table}: ${error.message}`);
    }
    console.log(`✓ ${table}: ${rows.length}`);
  }
  console.log(`Listo. SALON_ID=${salonId}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
