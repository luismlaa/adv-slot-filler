import type { Appointment, Gap, LocalDate, Nudge, Offer } from "@/domain/model";
import { DAY, HOUR, MINUTE, addDaysToDate, fromIso, localDateOf, toIso, zonedInstant } from "@/domain/time";
import { DEMO_SALON_ID, DEMO_TZ, demoServices, demoStaff } from "./catalog";
import { PERSONAS } from "./people";
import type { SeedPlanner } from "./planner";
import type { Rng } from "./rng";

const personaIds = new Set<string>(Object.values(PERSONAS).map((p) => p.id));
const categoryOf = (serviceId: string) => demoServices.find((s) => s.id === serviceId)?.category ?? "corte";

/**
 * Historia de las últimas 8 semanas para el panel de ROI: huecos rellenados (y algunos perdidos)
 * y citas que entraron por invitaciones de ciclo. Marca las citas correspondientes en el planner.
 */
export function generateRoiHistory(
  planner: SeedPlanner,
  rng: Rng,
  clientIds: readonly string[],
  anchor: number,
  anchorDate: LocalDate,
): { gaps: Gap[]; offers: Offer[]; nudges: Nudge[] } {
  const since = addDaysToDate(anchorDate, -56);
  const pastVisits = () =>
    planner.appointments.filter(
      (a) => a.status === "completed" && a.source !== "gapfill" && a.source !== "reactivation" && !personaIds.has(a.clientId) && localDateOf(fromIso(a.start), DEMO_TZ) >= since,
    );
  const gaps: Gap[] = [];
  const offers: Offer[] = [];
  const nudges: Nudge[] = [];
  const offer = (gap: Gap, clientId: string, serviceId: string, status: Offer["status"], sentAt: number, wave: number): Offer => ({
    id: planner.nextId("offer"),
    salonId: DEMO_SALON_ID,
    gapId: gap.id,
    clientId,
    serviceId,
    staffId: gap.staffId,
    start: gap.start,
    end: gap.end,
    wave,
    source: rng.chance(0.4) ? "waitlist" : "cycle",
    score: Math.round(rng.next() * 400) / 100,
    status,
    sentAt: toIso(sentAt),
    expiresAt: toIso(sentAt + 15 * MINUTE),
    respondedAt: status === "accepted" || status === "declined" ? toIso(sentAt + rng.int(1, 14) * MINUTE) : undefined,
  });

  // Huecos rellenados: una cita existente pasa a ser la que rellenó la cancelación de otro cliente.
  const filledTargets = [...pastVisits()].sort(() => rng.next() - 0.5).slice(0, 19);
  for (const target of filledTargets) {
    const cancelledAt = fromIso(target.start) - rng.int(3, 30) * HOUR;
    const filledAt = cancelledAt + rng.int(4, 45) * MINUTE;
    const canceller = rng.pick(clientIds.filter((id) => id !== target.clientId));
    const cancelled: Appointment = {
      ...target,
      id: planner.nextId("appt"),
      clientId: canceller,
      status: "cancelled",
      source: "whatsapp",
      createdAt: toIso(cancelledAt - 9 * DAY),
      cancelledAt: toIso(cancelledAt),
      cancelReason: "El cliente canceló por WhatsApp",
    };
    planner.addCancelled(cancelled);
    const wave = rng.chance(0.8) ? 1 : 2;
    const gap: Gap = {
      id: planner.nextId("gap"),
      salonId: DEMO_SALON_ID,
      staffId: target.staffId,
      start: target.start,
      end: target.end,
      originAppointmentId: cancelled.id,
      status: "filled",
      wave,
      createdAt: toIso(cancelledAt),
      filledAt: toIso(filledAt),
      filledByAppointmentId: target.id,
    };
    gaps.push(gap);
    planner.replace(target.id, { source: "gapfill", gapId: gap.id, createdAt: toIso(filledAt) });
    offers.push(offer(gap, target.clientId, target.serviceId, "accepted", cancelledAt + MINUTE, wave));
    for (let i = 0; i < 2; i += 1) offers.push(offer(gap, rng.pick(clientIds), target.serviceId, "superseded", cancelledAt + MINUTE, wave));
  }

  // Huecos que no se llenaron: se avisó muy tarde o nadie aceptó.
  for (let i = 0; i < 6; i += 1) {
    const date = addDaysToDate(anchorDate, -rng.int(2, 55));
    const staff = rng.pick(demoStaff);
    const service = rng.pick(demoServices.filter((s) => s.requiredSpecialties.every((r) => staff.specialties.includes(r))));
    const start = planner.findStart(staff, service, date);
    if (start === undefined) continue;
    const cancelledAt = start - rng.int(2, 20) * HOUR;
    const cancelled: Appointment = {
      id: planner.nextId("appt"),
      salonId: DEMO_SALON_ID,
      clientId: rng.pick(clientIds),
      staffId: staff.id,
      serviceId: service.id,
      start: toIso(start),
      end: toIso(start + service.durationMinutes * MINUTE),
      status: "cancelled",
      source: "whatsapp",
      price: service.price,
      createdAt: toIso(cancelledAt - 6 * DAY),
      cancelledAt: toIso(cancelledAt),
    };
    planner.addCancelled(cancelled);
    const gap: Gap = {
      id: planner.nextId("gap"),
      salonId: DEMO_SALON_ID,
      staffId: staff.id,
      start: cancelled.start,
      end: cancelled.end,
      originAppointmentId: cancelled.id,
      status: "expired",
      wave: 3,
      createdAt: toIso(cancelledAt),
    };
    gaps.push(gap);
    for (let w = 1; w <= 3; w += 1) offers.push(offer(gap, rng.pick(clientIds), service.id, "expired", cancelledAt + (w - 1) * 16 * MINUTE, w));
  }

  // Invitaciones de ciclo: ~1 de cada 3 terminó en cita.
  for (let week = 0; week < 8; week += 1) {
    const from = addDaysToDate(anchorDate, -7 * (week + 1));
    const to = addDaysToDate(from, 6);
    const inWeek = pastVisits().filter((a) => {
      const d = localDateOf(fromIso(a.start), DEMO_TZ);
      return d >= from && d <= to;
    });
    const booked = [...inWeek].sort(() => rng.next() - 0.5).slice(0, rng.int(3, 5));
    for (const visit of booked) {
      const previous = planner.appointments
        .filter((a) => a.clientId === visit.clientId && a.status === "completed" && a.start < visit.start)
        .at(-1);
      if (!previous) continue;
      const visitDate = localDateOf(fromIso(visit.start), DEMO_TZ);
      const sentAt = zonedInstant(addDaysToDate(visitDate, -rng.int(1, 3)), "10:00", DEMO_TZ);
      if (sentAt >= anchor) continue;
      planner.replace(visit.id, { source: "reactivation", createdAt: toIso(sentAt + rng.int(5, 90) * MINUTE) });
      nudges.push({
        id: planner.nextId("nudge"),
        salonId: DEMO_SALON_ID,
        clientId: visit.clientId,
        category: categoryOf(visit.serviceId),
        serviceId: visit.serviceId,
        dueDate: visitDate,
        lastVisitAppointmentId: previous.id,
        status: "booked",
        sentAt: toIso(sentAt),
        bookedAppointmentId: visit.id,
      });
    }
    for (let i = 0; i < rng.int(6, 9); i += 1) {
      const older = planner.appointments.filter(
        (a) => a.status === "completed" && !personaIds.has(a.clientId) && localDateOf(fromIso(a.start), DEMO_TZ) < from,
      );
      if (older.length === 0) break;
      const visit = rng.pick(older);
      nudges.push({
        id: planner.nextId("nudge"),
        salonId: DEMO_SALON_ID,
        clientId: visit.clientId,
        category: categoryOf(visit.serviceId),
        serviceId: visit.serviceId,
        dueDate: addDaysToDate(from, rng.int(0, 6)),
        lastVisitAppointmentId: visit.id,
        status: rng.chance(0.75) ? "ignored" : "declined",
        sentAt: toIso(zonedInstant(addDaysToDate(from, rng.int(0, 6)), "10:00", DEMO_TZ)),
      });
    }
  }
  return { gaps, offers, nudges };
}
