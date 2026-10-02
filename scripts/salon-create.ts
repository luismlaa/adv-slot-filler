/**
 * Da de alta un salón nuevo en la instancia multi-tenant e invita a su dueño.
 * Uso:
 *   npm run salon:create -- --name "Barbería X" --owner dueño@correo.com [--slug barberia-x]
 *     [--catalog salon.json] [--wa-phone-id 1234567890] [--address "…"] [--phone +1809…] [--timezone America/Santo_Domingo]
 * Requiere NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY y APP_URL en el entorno.
 * El dueño recibe un correo de invitación (enlace mágico).
 * `--catalog` carga especialidades, estilistas (con horario) y servicios; parte de
 * `config/salon-template.json` y edítalo con los datos del salón. Luego se ajustan en Ajustes.
 */
import { readFileSync } from "node:fs";
import { z } from "zod";
import { demoSpecialties } from "@/adapters/memory/seed/catalog";
import { createServiceClient } from "@/adapters/supabase/client";
import { toRow } from "@/adapters/supabase/rows";
import { serviceSchema, specialtySchema, staffSchema } from "@/domain/model";

/** Catálogo inicial del salón: lo mismo que el seed, sin ids (se generan aquí). */
const catalogSchema = z.object({
  specialties: z.array(specialtySchema).min(1),
  staff: z.array(staffSchema.omit({ id: true, salonId: true })).min(1),
  services: z.array(serviceSchema.omit({ id: true, salonId: true })).min(1),
});

function arg(name: string): string | undefined {
  const args = process.argv.slice(2);
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}

const slugify = (text: string) =>
  text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

async function main() {
  const name = arg("name");
  const owner = arg("owner");
  if (!name || !owner) throw new Error('Uso: npm run salon:create -- --name "Barbería X" --owner dueño@correo.com [--wa-phone-id …]');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const appUrl = process.env.APP_URL;
  if (!url || !key || !appUrl) throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY o APP_URL");
  const db = createServiceClient(url, key, 30_000);

  const salonId = crypto.randomUUID();
  const salon = {
    id: salonId,
    name,
    slug: arg("slug") ?? slugify(name),
    timezone: arg("timezone") ?? "America/Santo_Domingo",
    currency: "DOP",
    address: arg("address") ?? null,
    phone: arg("phone") ?? null,
    whatsapp_phone_number_id: arg("wa-phone-id") ?? null,
    active: true,
  };
  const created = await db.from("salons").insert(salon);
  if (created.error) throw new Error(`salons: ${created.error.message}`);
  const catalogFile = arg("catalog");
  const catalog = catalogFile ? catalogSchema.parse(JSON.parse(readFileSync(catalogFile, "utf8"))) : undefined;
  const specialties = await db.from("specialties").insert((catalog?.specialties ?? demoSpecialties).map((s) => ({ ...s, salon_id: salonId })));
  if (specialties.error) throw new Error(`specialties: ${specialties.error.message}`);
  if (catalog) {
    const known = new Set(catalog.specialties.map((s) => s.id));
    const unknown = [...catalog.staff.flatMap((s) => s.specialties), ...catalog.services.flatMap((s) => s.requiredSpecialties)].filter((id) => !known.has(id));
    if (unknown.length > 0) throw new Error(`Especialidades no declaradas en el catálogo: ${[...new Set(unknown)].join(", ")}`);
    for (const [table, rows] of [
      ["staff", catalog.staff.map((s) => toRow({ ...s, id: crypto.randomUUID(), salonId }))],
      ["services", catalog.services.map((s) => toRow({ ...s, id: crypto.randomUUID(), salonId }))],
    ] as const) {
      const inserted = await db.from(table).insert(rows);
      if (inserted.error) throw new Error(`${table}: ${inserted.error.message}`);
    }
  }

  // Si el correo ya tiene usuario (p. ej. dueño de otra sucursal), se reutiliza.
  const invited = await db.auth.admin.inviteUserByEmail(owner, { redirectTo: `${appUrl}/auth/callback` });
  let userId = invited.data.user?.id;
  if (!userId) {
    const users = await db.auth.admin.listUsers({ perPage: 1000 });
    userId = users.data.users.find((u) => u.email?.toLowerCase() === owner.toLowerCase())?.id;
  }
  if (!userId) throw new Error(`No se pudo invitar a ${owner}: ${invited.error?.message ?? "usuario no encontrado"}`);
  const member = await db.from("salon_members").insert({ salon_id: salonId, user_id: userId, role: "owner" });
  if (member.error) throw new Error(`salon_members: ${member.error.message}`);

  console.log(`✓ Salón «${name}» creado: id=${salonId} slug=${salon.slug}`);
  console.log(`✓ ${owner} es dueño${invited.data.user ? " (invitación enviada por correo)" : " (usuario existente)"}`);
  if (!salon.whatsapp_phone_number_id) console.log("! Sin número de WhatsApp: sus envíos quedan en dry-run hasta asignarle uno (salons.whatsapp_phone_number_id).");
  console.log(catalog ? `✓ Catálogo: ${catalog.staff.length} estilistas, ${catalog.services.length} servicios` : "! Sin --catalog: el salón no tiene estilistas ni servicios todavía.");
  console.log(`Siguiente: importa su historial (npm run import:csv -- historial.csv --salon ${salonId}).`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
