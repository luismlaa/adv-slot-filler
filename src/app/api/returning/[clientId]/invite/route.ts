import { getContainer } from "@/lib/container";
import { HttpError, json, salonRoute } from "@/lib/http";
import { inviteClient } from "@/services/reactivation";

export const dynamic = "force-dynamic";

const REASONS = { no_cycle: "Ese cliente aún no tiene historial", opted_out: "El cliente pidió no recibir avisos", not_sent: "No se pudo enviar ahora (horas de silencio o canal caído)" };

export const POST = salonRoute(async (_request: Request, context: RouteContext<"/api/returning/[clientId]/invite">) => {
  const { clientId } = await context.params;
  const result = await inviteClient(getContainer().ctx, clientId);
  if (!result.ok) throw new HttpError(409, REASONS[result.reason]);
  return json(result.nudge, 201);
});
