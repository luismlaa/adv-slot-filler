import { getContainer } from "@/lib/container";
import { json, requireCron, route } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Red de seguridad por si se pierde un push de Google: sync incremental de todos los calendarios. */
export const POST = route(async (request: Request) => {
  requireCron(request);
  await getContainer().calendarSync.syncAll();
  return json({ ok: true });
});
