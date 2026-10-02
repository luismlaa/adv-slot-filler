import { serviceSchema } from "@/domain/model";
import { getContainer } from "@/lib/container";
import { HttpError, json, parseBody, route } from "@/lib/http";
import { saveService } from "@/services/settings";

export const dynamic = "force-dynamic";

export const PUT = route(async (request: Request, context: RouteContext<"/api/services/[id]">) => {
  const { id } = await context.params;
  const body = await parseBody(request, serviceSchema);
  if (body.id !== id) throw new HttpError(400, "El id no coincide");
  return json(await saveService(getContainer().ctx, body));
});
