import { getContainer } from "@/lib/container";
import { json, requireCron, route } from "@/lib/http";
import { tick } from "@/services/jobs";

export const dynamic = "force-dynamic";

/** Llamado por pg_cron (producción) cada 5 minutos. Idempotente. */
export const POST = route(async (request: Request) => {
  requireCron(request);
  return json(await tick(getContainer().ctx));
});
