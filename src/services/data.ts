import { type BusinessConfigOverrides, resolveBusinessConfig } from "@/config/business";
import type { CopyContext } from "@/domain/conversation";
import { analyzeCycles, type ClientCycle } from "@/domain/cycles";
import type { Salon } from "@/domain/model";
import { DAY, type ScheduleSnapshot, addDaysToDate, localDateOf, toIso } from "@/domain/time";
import type { DomainEvent, DomainEventType } from "@/ports";
import type { AppContext } from "./context";

export const salonConfig = (salon: Salon) => resolveBusinessConfig(salon.settings as BusinessConfigOverrides);

export async function today(ctx: AppContext): Promise<string> {
  const salon = await ctx.store.salon.get();
  return localDateOf(ctx.clock.now(), salon.timezone);
}

/** Agenda vigente alrededor de "ahora": lo que necesitan asignación y relleno. */
export async function loadSnapshot(ctx: AppContext, horizonDays?: number): Promise<ScheduleSnapshot> {
  const config = await ctx.config();
  const now = ctx.clock.now();
  const days = horizonDays ?? config.slots.searchHorizonDays + 14;
  const range = { from: toIso(now - DAY), to: toIso(now + days * DAY) };
  const [salon, staff, services, appointments, blocks] = await Promise.all([
    ctx.store.salon.get(),
    ctx.store.staff.list(),
    ctx.store.services.list(),
    ctx.store.appointments.list({ ...range, statuses: ["booked", "completed"] }),
    ctx.store.blocks.list(range),
  ]);
  return { timezone: salon.timezone, staff: staff.filter((s) => s.active), services, appointments, blocks };
}

/** Ciclos de todos los clientes (historial completo dentro del lookback). */
export async function loadCycles(ctx: AppContext): Promise<ClientCycle[]> {
  const config = await ctx.config();
  const now = ctx.clock.now();
  const [salon, services, appointments] = await Promise.all([
    ctx.store.salon.get(),
    ctx.store.services.list(),
    ctx.store.appointments.list({ from: toIso(now - config.cycles.lookbackDays * DAY), statuses: ["completed", "booked"] }),
  ]);
  const todayDate = localDateOf(now, salon.timezone);
  return analyzeCycles({ appointments, services, timezone: salon.timezone, today: todayDate, now, params: config.cycles });
}

export async function copyContext(ctx: AppContext): Promise<CopyContext> {
  const [salon, staff, services] = await Promise.all([ctx.store.salon.get(), ctx.store.staff.list(), ctx.store.services.list()]);
  return { salonName: salon.name, address: salon.address, currency: salon.currency, timezone: salon.timezone, today: localDateOf(ctx.clock.now(), salon.timezone), staff, services };
}

export function publish(ctx: AppContext, type: DomainEventType, payload: Record<string, unknown> = {}): void {
  const event: DomainEvent = { type, salonId: ctx.store.salonId, at: toIso(ctx.clock.now()), payload };
  ctx.bus.publish(event);
}

export { addDaysToDate };
