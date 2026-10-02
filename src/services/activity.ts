import type { Activity } from "@/domain/model";
import { toIso } from "@/domain/time";
import type { AppContext } from "./context";
import { publish } from "./data";

type Refs = Pick<Activity, "clientId" | "staffId" | "appointmentId" | "gapId">;

/**
 * Registra una decisión del sistema en la bitácora (visible en el feed del salón) y en el log
 * estructurado, con el contexto de negocio: quién, qué entidad y por qué.
 */
export async function recordActivity(
  ctx: AppContext,
  kind: string,
  message: string,
  refs: Refs = {},
  severity: Activity["severity"] = "info",
): Promise<Activity> {
  const entry: Activity = {
    id: ctx.ids.newId(),
    salonId: ctx.store.salonId,
    at: toIso(ctx.clock.now()),
    kind,
    severity,
    message,
    ...refs,
  };
  await ctx.store.activity.insert(entry);
  ctx.logger.info(message, { kind, salonId: ctx.store.salonId, ...refs });
  publish(ctx, "activity", { id: entry.id, kind });
  return entry;
}
