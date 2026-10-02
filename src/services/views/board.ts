import type { AppointmentSource, AppointmentStatus, LocalDate } from "@/domain/model";
import {
  DAY,
  MINUTE,
  type Interval,
  busyIntervals,
  fromIso,
  localDateOf,
  localParts,
  subtractIntervals,
  toIso,
  utilization,
  workingIntervals,
  zonedInstant,
} from "@/domain/time";
import type { AppContext } from "../context";
import { loadSnapshot } from "../data";

export interface BoardAppointment {
  readonly id: string;
  readonly staffId: string;
  readonly clientId: string;
  readonly clientName: string;
  readonly clientPhone: string;
  readonly serviceName: string;
  readonly start: string;
  readonly end: string;
  readonly status: AppointmentStatus;
  readonly source: AppointmentSource;
  readonly price: number;
}

export interface BoardGap {
  readonly id: string;
  readonly staffId: string;
  readonly start: string;
  readonly end: string;
  readonly status: "open" | "filled" | "expired";
  readonly wave: number;
  readonly pendingOffers: readonly { clientName: string; expiresAt: string; source: "waitlist" | "cycle" }[];
}

export interface BoardView {
  readonly salon: { name: string; timezone: string; currency: string };
  readonly date: LocalDate;
  readonly today: LocalDate;
  readonly now: string;
  /** Rango de horas a dibujar (minutos desde medianoche). */
  readonly dayStartMinutes: number;
  readonly dayEndMinutes: number;
  readonly staff: readonly {
    id: string;
    name: string;
    color: string;
    specialties: readonly string[];
    working: readonly { start: string; end: string }[];
    utilization: number;
  }[];
  readonly appointments: readonly BoardAppointment[];
  readonly blocks: readonly { id: string; staffId: string; start: string; end: string; title: string; source: "manual" | "calendar" }[];
  /** Tiempo libre reservable (≥ servicio más corto) desde ahora. */
  readonly freeSlots: readonly { staffId: string; start: string; end: string }[];
  readonly gaps: readonly BoardGap[];
}

/** Todo lo que dibuja el tablero de agenda de un día. */
export async function boardView(ctx: AppContext, date?: LocalDate): Promise<BoardView> {
  const [salon, clients, gapsAll, pendingOffers] = await Promise.all([
    ctx.store.salon.get(),
    ctx.store.clients.list(),
    ctx.store.gaps.list(),
    ctx.store.offers.list({ statuses: ["pending"] }),
  ]);
  const now = ctx.clock.now();
  const today = localDateOf(now, salon.timezone);
  const day = date ?? today;
  const dayStart = zonedInstant(day, "00:00", salon.timezone);
  const dayEnd = dayStart + DAY;
  const snapshot = await loadSnapshot(ctx, Math.max(14, Math.ceil((dayEnd - now) / DAY) + 1));
  const services = new Map(snapshot.services.map((s) => [s.id, s]));
  const clientById = new Map(clients.map((c) => [c.id, c]));
  const inDay = (start: string, end: string) => fromIso(start) < dayEnd && fromIso(end) > dayStart;

  const allDayAppointments = await ctx.store.appointments.list({ from: toIso(dayStart), to: toIso(dayEnd) });
  const appointments: BoardAppointment[] = allDayAppointments
    .filter((a) => a.status !== "cancelled")
    .map((a) => ({
      id: a.id,
      staffId: a.staffId,
      clientId: a.clientId,
      clientName: clientById.get(a.clientId)?.name ?? "Cliente",
      clientPhone: clientById.get(a.clientId)?.phone ?? "",
      serviceName: services.get(a.serviceId)?.name ?? "Servicio",
      start: a.start,
      end: a.end,
      status: a.status,
      source: a.source,
      price: a.price,
    }));

  const shortest = Math.min(...snapshot.services.filter((s) => s.active).map((s) => s.durationMinutes)) * MINUTE;
  const staffViews = snapshot.staff.map((s) => {
    const working = workingIntervals(s, day, salon.timezone);
    return {
      id: s.id,
      name: s.name,
      color: s.color,
      specialties: s.specialties,
      working: working.map((w) => ({ start: toIso(w.start), end: toIso(w.end) })),
      utilization: utilization(s, day, snapshot),
    };
  });
  const freeSlots = snapshot.staff.flatMap((s) => {
    const working = workingIntervals(s, day, salon.timezone).map((w) => ({ start: Math.max(w.start, now), end: w.end })).filter((w) => w.end > w.start);
    return subtractIntervals(working, busyIntervals(s.id, snapshot))
      .filter((f: Interval) => f.end - f.start >= shortest)
      .map((f) => ({ staffId: s.id, start: toIso(f.start), end: toIso(f.end) }));
  });

  const minutes = snapshot.staff.flatMap((s) => (s.schedule[localParts(dayStart + 12 * 3_600_000, salon.timezone).weekday] ?? []).flatMap((r) => [r.start, r.end]));
  const toMinutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const dayStartMinutes = minutes.length ? Math.min(...minutes.map(toMinutes)) : 8 * 60;
  const dayEndMinutes = minutes.length ? Math.max(...minutes.map(toMinutes)) : 19 * 60;

  return {
    salon: { name: salon.name, timezone: salon.timezone, currency: salon.currency },
    date: day,
    today,
    now: toIso(now),
    dayStartMinutes,
    dayEndMinutes,
    staff: staffViews,
    appointments,
    blocks: snapshot.blocks.filter((b) => inDay(b.start, b.end)).map((b) => ({ id: b.id, staffId: b.staffId, start: b.start, end: b.end, title: b.title, source: b.source })),
    freeSlots,
    gaps: gapsAll
      .filter((g) => inDay(g.start, g.end) && (g.status === "open" || fromIso(g.filledAt ?? g.createdAt) > now - 2 * 3_600_000))
      .map((g) => ({
        id: g.id,
        staffId: g.staffId,
        start: g.start,
        end: g.end,
        status: g.status,
        wave: g.wave,
        pendingOffers: pendingOffers
          .filter((o) => o.gapId === g.id)
          .map((o) => ({ clientName: clientById.get(o.clientId)?.name ?? "Cliente", expiresAt: o.expiresAt, source: o.source })),
      })),
  };
}

