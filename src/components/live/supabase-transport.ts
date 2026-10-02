import { createBrowserClient } from "@supabase/ssr";
import type { DomainEvent, DomainEventType } from "@/ports/runtime";

type Row = Record<string, unknown>;

/** Traduce cambios de tablas (Realtime) a los mismos eventos de dominio que emite el bus en memoria. */
function toEvents(table: string, kind: string, row: Row): DomainEventType[] {
  const status = row.status;
  switch (table) {
    case "appointments":
      return kind === "INSERT" ? ["appointment.booked"] : status === "cancelled" ? ["appointment.cancelled"] : ["appointment.updated"];
    case "gaps":
      return kind === "INSERT" ? ["gap.opened"] : status === "filled" ? ["gap.filled"] : status === "expired" ? ["gap.expired"] : ["gap.opened"];
    case "offers":
      return kind === "INSERT" ? ["offer.sent"] : status === "accepted" ? ["offer.accepted"] : status === "declined" ? ["offer.declined"] : ["offer.expired"];
    case "messages":
      return [row.direction === "in" ? "message.in" : "message.out"];
    case "blocks":
      return ["block.changed"];
    case "activity":
      return ["activity"];
    default:
      return [];
  }
}

/**
 * Suscripción a Supabase Realtime con la sesión del usuario: RLS decide qué filas ve.
 * Devuelve la función de limpieza para el efecto de React.
 */
export function connectSupabaseRealtime(emit: (event: DomainEvent) => void, setConnected: (v: boolean) => void): () => void {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return () => undefined;
  const supabase = createBrowserClient(url, key);
  const channel = supabase.channel("slot-filler-live");
  for (const table of ["appointments", "gaps", "offers", "messages", "blocks", "activity"]) {
    channel.on("postgres_changes", { event: "*", schema: "public", table }, (change) => {
      const row = (change.new ?? {}) as Row;
      for (const type of toEvents(table, change.eventType, row)) {
        emit({
          type,
          salonId: String(row.salon_id ?? ""),
          at: new Date().toISOString(),
          payload: { appointmentId: table === "appointments" ? row.id : row.filled_by_appointment_id, phone: row.phone, purpose: row.purpose, staffId: row.staff_id },
        });
      }
    });
  }
  channel.subscribe((status) => setConnected(status === "SUBSCRIBED"));
  return () => {
    void supabase.removeChannel(channel);
  };
}
