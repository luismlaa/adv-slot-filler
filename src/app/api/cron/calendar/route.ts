import { json, requireCron, route } from "@/lib/http";
import { forEachSalon } from "@/lib/tenants";

export const dynamic = "force-dynamic";

/** Red de seguridad por si se pierde un push de Google: sync incremental de los calendarios de cada salón. */
export const POST = route(async (request: Request) => {
  requireCron(request);
  const runs = await forEachSalon("el sync de calendarios", (scope) => scope.calendarSync.syncAll());
  return json({ salons: runs.length, failed: runs.filter((r) => !r.ok).length }, runs.some((r) => !r.ok) ? 500 : 200);
});
