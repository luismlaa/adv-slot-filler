/**
 * Importa el historial de clientes de un salón real desde CSV (fase D5).
 * Uso: npx tsx scripts/import-csv.ts historial.csv [--apply]
 * Sin --apply solo valida y muestra el resumen (dry-run). Requiere DATA_BACKEND=supabase en el entorno.
 */
import { readFileSync } from "node:fs";
import { createServiceClient } from "@/adapters/supabase/client";
import { createSupabaseStore } from "@/adapters/supabase/store";
import { parseEnv } from "@/config/env";
import { importHistoryCsv } from "@/services/import/history";

async function main() {
  const [file, flag] = process.argv.slice(2);
  if (!file) throw new Error("Uso: npx tsx scripts/import-csv.ts archivo.csv [--apply]");
  const env = parseEnv({ ...process.env, DATA_BACKEND: "supabase" });
  const store = createSupabaseStore(createServiceClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!), env.SALON_ID!);
  const [salon, staff, services, existingClients] = await Promise.all([store.salon.get(), store.staff.list(), store.services.list(), store.clients.list()]);
  const result = importHistoryCsv(readFileSync(file, "utf8"), {
    salonId: salon.id,
    timezone: salon.timezone,
    staff,
    services,
    existingClients,
    now: Date.now(),
    newId: () => crypto.randomUUID(),
  });
  console.log(`Clientes nuevos: ${result.clients.length} · Citas: ${result.appointments.length} · Errores: ${result.errors.length}`);
  for (const e of result.errors.slice(0, 50)) console.log(`  línea ${e.line}: ${e.message}`);
  if (flag !== "--apply") {
    console.log("Dry-run: no se guardó nada. Corrige los errores y repite con --apply.");
    return;
  }
  for (const client of result.clients) await store.clients.insert(client);
  let conflicts = 0;
  for (const appointment of result.appointments) {
    const inserted = await store.appointments.insertIfFree(appointment);
    if (!inserted.ok) conflicts += 1;
  }
  console.log(`Guardado. Citas que chocaron con datos existentes: ${conflicts}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
