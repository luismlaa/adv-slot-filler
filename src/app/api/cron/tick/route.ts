import { json, requireCron, route } from "@/lib/http";
import { forEachSalon } from "@/lib/tenants";
import { tick } from "@/services/jobs";

export const dynamic = "force-dynamic";

/** Llamado por pg_cron (producción) cada 5 minutos, para todos los salones activos. Idempotente. */
export const POST = route(async (request: Request) => {
  requireCron(request);
  // pg_cron reparte una petición por salón (`?salon=`): cada una cabe en el límite de CPU del Worker.
  const only = new URL(request.url).searchParams.get("salon") ?? undefined;
  const runs = await forEachSalon("el tick", (scope) => tick(scope.ctx), undefined, only);
  return json({ salons: runs.length, failed: runs.filter((r) => !r.ok).length, runs }, runs.some((r) => !r.ok) ? 500 : 200);
});
