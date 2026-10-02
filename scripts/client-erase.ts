/**
 * Derecho de cancelación (Ley 172-13): borra los datos personales de un cliente de un salón.
 * Uso: npm run client:erase -- --salon <id> --phone +18095550101 [--apply]
 * Sin --apply solo muestra lo que se borraría.
 *
 * Se borran sus mensajes, su conversación, su lista de espera, ofertas e invitaciones. Las citas pasadas
 * se conservan como datos agregados (servicio, estilista, precio) para que las métricas del salón no
 * cambien, pero el cliente queda anonimizado: sin nombre, sin teléfono real, sin notas.
 */
import { createServiceClient } from "@/adapters/supabase/client";

function arg(name: string): string | undefined {
  const args = process.argv.slice(2);
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}

async function main() {
  const salonId = arg("salon");
  const phone = arg("phone");
  const apply = process.argv.includes("--apply");
  if (!salonId || !phone || !/^\+\d{8,15}$/.test(phone)) throw new Error("Uso: npm run client:erase -- --salon <id> --phone +1809… [--apply]");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY");
  const db = createServiceClient(url, key, 30_000);

  const client = (await db.from("clients").select("id, name").eq("salon_id", salonId).eq("phone", phone).maybeSingle()).data as { id: string; name: string } | null;
  const count = async (table: string, column: string, value: string) =>
    (await db.from(table).select("*", { count: "exact", head: true }).eq("salon_id", salonId).eq(column, value)).count ?? 0;
  const plan = {
    messages: await count("messages", "phone", phone),
    conversations: await count("conversations", "phone", phone),
    waitlist_entries: client ? await count("waitlist_entries", "client_id", client.id) : 0,
    offers: client ? await count("offers", "client_id", client.id) : 0,
    nudges: client ? await count("nudges", "client_id", client.id) : 0,
  };
  console.log(client ? `Cliente: ${client.name} (${client.id})` : "No hay cliente con ese teléfono; solo se borran mensajes sueltos.");
  console.log("Se borra:", plan);
  if (!apply) {
    console.log("Dry-run: no se borró nada. Repite con --apply.");
    return;
  }

  const del = async (table: string, column: string, value: string) => {
    const { error } = await db.from(table).delete().eq("salon_id", salonId).eq(column, value);
    if (error) throw new Error(`${table}: ${error.message}`);
  };
  await del("messages", "phone", phone);
  await del("conversations", "phone", phone);
  if (client) {
    await del("waitlist_entries", "client_id", client.id);
    await del("offers", "client_id", client.id);
    await del("nudges", "client_id", client.id);
    // Teléfono sustituto único y válido (+0 seguido de dígitos del id): no corresponde a nadie.
    const placeholder = `+0${client.id.replace(/\D/g, "").padEnd(10, "0").slice(0, 14)}`;
    const { error } = await db
      .from("clients")
      .update({ name: "Cliente eliminado", phone: placeholder, notes: null, preferred_staff_id: null, opted_out: true })
      .eq("salon_id", salonId)
      .eq("id", client.id);
    if (error) throw new Error(`clients: ${error.message}`);
  }
  console.log("✓ Datos personales eliminados. Las copias de respaldo vencen solas en 30 días.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
