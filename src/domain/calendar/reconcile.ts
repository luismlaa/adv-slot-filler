import type { ExternalEvent } from "@/ports/calendar";
import type { Appointment, Block, Id } from "../model";
import { fromIso, overlaps } from "../time";

export type CalendarConflict =
  | { readonly kind: "our_event_deleted"; readonly appointmentId: Id; readonly eventId: string }
  | { readonly kind: "our_event_moved"; readonly appointmentId: Id; readonly eventId: string; readonly start: string; readonly end: string }
  | { readonly kind: "personal_event_overlaps"; readonly eventId: string; readonly title: string; readonly appointmentIds: readonly Id[] };

export interface ReconcilePlan {
  /** Eventos personales del estilista → bloqueos de agenda (nuevos o actualizados). */
  readonly upsertBlocks: readonly Omit<Block, "id" | "salonId" | "createdAt">[];
  /** Bloqueos cuyo evento personal se borró en el calendario. */
  readonly deleteBlockIds: readonly Id[];
  /** Cambios que no se aplican solos: se avisan al salón. */
  readonly conflicts: readonly CalendarConflict[];
}

/**
 * Decide qué hacer con los cambios que llegan del calendario externo de un estilista.
 * Reglas:
 * - Un evento personal (no creado por Slot Filler) bloquea ese tiempo en la agenda.
 * - Slot Filler es la fuente de verdad de SUS citas: si alguien borra o mueve en Google un evento
 *   de una cita, no se cancela ni se mueve la cita — se genera un conflicto para que el salón decida.
 * - Si un evento personal choca con citas ya reservadas, el bloqueo se crea igual (el estilista no
 *   estará) y se avisa del choque.
 */
export function planCalendarChanges(
  staffId: Id,
  events: readonly ExternalEvent[],
  appointments: readonly Appointment[],
  blocks: readonly Block[],
): ReconcilePlan {
  const upsertBlocks: Omit<Block, "id" | "salonId" | "createdAt">[] = [];
  const deleteBlockIds: Id[] = [];
  const conflicts: CalendarConflict[] = [];
  const mine = appointments.filter((a) => a.staffId === staffId);

  for (const event of events) {
    if (event.slotFillerId !== undefined) {
      const appointment = mine.find((a) => a.id === event.slotFillerId);
      if (!appointment || appointment.status !== "booked") continue;
      if (event.status === "cancelled") {
        conflicts.push({ kind: "our_event_deleted", appointmentId: appointment.id, eventId: event.id });
      } else if (fromIso(event.start) !== fromIso(appointment.start) || fromIso(event.end) !== fromIso(appointment.end)) {
        conflicts.push({ kind: "our_event_moved", appointmentId: appointment.id, eventId: event.id, start: event.start, end: event.end });
      }
      continue;
    }

    const existing = blocks.find((b) => b.staffId === staffId && b.externalEventId === event.id);
    if (event.status === "cancelled") {
      if (existing) deleteBlockIds.push(existing.id);
      continue;
    }
    upsertBlocks.push({ staffId, start: event.start, end: event.end, title: event.title || "Ocupado", source: "calendar", externalEventId: event.id });
    const interval = { start: fromIso(event.start), end: fromIso(event.end) };
    const clashing = mine.filter((a) => a.status === "booked" && overlaps(interval, { start: fromIso(a.start), end: fromIso(a.end) }));
    if (clashing.length > 0) {
      conflicts.push({ kind: "personal_event_overlaps", eventId: event.id, title: event.title, appointmentIds: clashing.map((a) => a.id) });
    }
  }
  return { upsertBlocks, deleteBlockIds, conflicts };
}
