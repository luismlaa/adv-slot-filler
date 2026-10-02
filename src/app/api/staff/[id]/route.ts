import { staffSchema } from "@/domain/model";
import { getContainer } from "@/lib/container";
import { HttpError, json, parseBody, salonRoute } from "@/lib/http";
import { saveStaff } from "@/services/settings";

export const dynamic = "force-dynamic";

export const PUT = salonRoute(async (request: Request, context: RouteContext<"/api/staff/[id]">) => {
  const { id } = await context.params;
  const body = await parseBody(request, staffSchema);
  if (body.id !== id) throw new HttpError(400, "El id no coincide");
  return json(await saveStaff(getContainer().ctx, body));
});
