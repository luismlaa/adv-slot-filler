import { returningThisWeek } from "@/domain/cycles";
import type { CycleStatus } from "@/domain/cycles";
import type { LocalDate } from "@/domain/model";
import { addDaysToDate, localDateOf, startOfWeekDate } from "@/domain/time";
import type { AppContext } from "../context";
import { loadCycles } from "../data";

export interface ReturningRow {
  readonly clientId: string;
  readonly clientName: string;
  readonly phone: string;
  readonly optedOut: boolean;
  readonly category: string;
  readonly serviceName: string;
  readonly staffName: string;
  readonly expectedDays: number;
  readonly confidence: number;
  readonly visits: number;
  readonly lastVisitDate: LocalDate;
  readonly dueDate: LocalDate;
  readonly daysSinceLast: number;
  readonly daysUntilDue: number;
  readonly status: CycleStatus;
  /** Estado de la invitación de este ciclo, si ya se envió. */
  readonly nudge?: { status: "sent" | "booked" | "declined" | "ignored"; sentAt: string };
}

export interface ReturningView {
  readonly weekStart: LocalDate;
  readonly weekEnd: LocalDate;
  readonly today: LocalDate;
  readonly rows: readonly ReturningRow[];
  readonly counts: Readonly<Record<CycleStatus, number>>;
  readonly atRisk: readonly ReturningRow[];
}

/** Panel "clientes por volver esta semana" según el patrón real de cada uno. */
export async function returningView(ctx: AppContext, weekStart?: LocalDate): Promise<ReturningView> {
  const [salon, cycles, clients, staff, services, nudges] = await Promise.all([
    ctx.store.salon.get(),
    loadCycles(ctx),
    ctx.store.clients.list(),
    ctx.store.staff.list(),
    ctx.store.services.list(),
    ctx.store.nudges.list(),
  ]);
  const today = localDateOf(ctx.clock.now(), salon.timezone);
  const start = weekStart ?? startOfWeekDate(today);
  const toRow = (c: (typeof cycles)[number]): ReturningRow => {
    const client = clients.find((x) => x.id === c.clientId);
    const nudge = nudges
      .filter((n) => n.clientId === c.clientId && n.lastVisitAppointmentId === c.lastVisitAppointmentId)
      .sort((a, b) => b.sentAt.localeCompare(a.sentAt))[0];
    return {
      clientId: c.clientId,
      clientName: client?.name ?? "Cliente",
      phone: client?.phone ?? "",
      optedOut: client?.optedOut ?? false,
      category: c.category,
      serviceName: services.find((s) => s.id === c.usualServiceId)?.name ?? "",
      staffName: staff.find((s) => s.id === c.usualStaffId)?.name ?? "",
      expectedDays: c.expectedDays,
      confidence: c.confidence,
      visits: c.visits,
      lastVisitDate: c.lastVisitDate,
      dueDate: c.dueDate,
      daysSinceLast: c.daysSinceLast,
      daysUntilDue: c.daysUntilDue,
      status: c.status,
      nudge: nudge ? { status: nudge.status, sentAt: nudge.sentAt } : undefined,
    };
  };
  const counts = cycles.reduce<Record<CycleStatus, number>>(
    (acc, c) => ({ ...acc, [c.status]: acc[c.status] + 1 }),
    { ok: 0, due: 0, overdue: 0, at_risk: 0, booked: 0 },
  );
  return {
    weekStart: start,
    weekEnd: addDaysToDate(start, 6),
    today,
    rows: returningThisWeek(cycles, start).map(toRow),
    counts,
    atRisk: cycles
      .filter((c) => c.status === "at_risk")
      .sort((a, b) => b.visits - a.visits)
      .slice(0, 15)
      .map(toRow),
  };
}
