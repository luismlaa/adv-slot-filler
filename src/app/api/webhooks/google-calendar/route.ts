import { getContainer } from "@/lib/container";
import { json, route } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Notificación push de Google ("algo cambió en este calendario"). No trae datos: se responde rápido
 * y se hace sync incremental del estilista dueño del canal.
 */
export const POST = route(async (request: Request) => {
  const channelId = request.headers.get("x-goog-channel-id");
  const state = request.headers.get("x-goog-resource-state");
  if (!channelId || state === "sync") return json({ ok: true });
  const handled = await getContainer().calendarSync.handlePush(channelId);
  return json({ ok: handled }, handled ? 200 : 404);
});
