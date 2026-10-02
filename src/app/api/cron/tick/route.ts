import { json, requireCron, route } from "@/lib/http";
import { forEachSalon } from "@/lib/tenants";
import { tick } from "@/services/jobs";

export const dynamic = "force-dynamic";

/** Llamado por pg_cron (producción) cada 5 minutos, para todos los salones activos. Idempotente. */
export const POST = route(async (request: Request) => {
  requireCron(request);
  const runs = await forEachSalon("el tick", (scope) => tick(scope.ctx));
  return json({ salons: runs.length, failed: runs.filter((r) => !r.ok).length, runs }, runs.some((r) => !r.ok) ? 500 : 200);
});
