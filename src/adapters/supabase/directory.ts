import type { SupabaseClient } from "@supabase/supabase-js";
import type { Membership, TenantDirectory } from "@/ports";

function unwrap<T>(result: { data: T | null; error: { message: string } | null }, what: string): T | null {
  if (result.error) throw new Error(`Supabase (${what}): ${result.error.message}`);
  return result.data;
}

/** Directorio de salones sobre Supabase, con service role (consulta por encima de los salones). */
export function createSupabaseDirectory(db: SupabaseClient): TenantDirectory {
  return {
    async activeSalonIds() {
      const rows = unwrap(await db.from("salons").select("id").eq("active", true), "salons.active") ?? [];
      return rows.map((r: { id: string }) => r.id);
    },
    async salonForWhatsAppNumber(phoneNumberId) {
      const row = unwrap(await db.from("salons").select("id").eq("whatsapp_phone_number_id", phoneNumberId).eq("active", true).maybeSingle(), "salons.whatsapp");
      return (row as { id: string } | null)?.id;
    },
    async salonForCalendarChannel(channelId) {
      const row = unwrap(await db.from("calendar_links").select("salon_id").eq("channel_id", channelId).maybeSingle(), "calendar_links.channel");
      return (row as { salon_id: string } | null)?.salon_id;
    },
    async membershipsOf(userId) {
      const rows = unwrap(
        await db.from("salon_members").select("salon_id, role, staff_id, salons!inner(active)").eq("user_id", userId).eq("salons.active", true).order("salon_id"),
        "salon_members",
      ) ?? [];
      return (rows as { salon_id: string; role: Membership["role"]; staff_id: string | null }[]).map((r) => ({ salonId: r.salon_id, role: r.role, staffId: r.staff_id ?? undefined }));
    },
    async ping() {
      unwrap(await db.from("salons").select("id").limit(1), "ping");
    },
  };
}
