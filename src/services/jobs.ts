import { completePastAppointments } from "./booking";
import type { AppContext } from "./context";
import { tickGaps } from "./gapfill";
import { type ReactivationRun, runReactivation } from "./reactivation";

export interface TickReport {
  readonly completed: number;
  readonly reactivation: ReactivationRun;
}

/**
 * Trabajo periódico (pg_cron cada 5 min en producción; el reloj simulado en la demo):
 * 1. cierra citas terminadas, 2. vence ofertas y hace avanzar huecos, 3. invitaciones de ciclo.
 * Cada paso es idempotente: correrlo dos veces no duplica efectos.
 */
export async function tick(ctx: AppContext, options: { forceReactivation?: boolean } = {}): Promise<TickReport> {
  const completed = await completePastAppointments(ctx);
  await tickGaps(ctx);
  const reactivation = await runReactivation(ctx, { force: options.forceReactivation });
  ctx.logger.info("Tick completado", { salonId: ctx.store.salonId, completed, nudgesSent: reactivation.sent });
  return { completed, reactivation };
}
