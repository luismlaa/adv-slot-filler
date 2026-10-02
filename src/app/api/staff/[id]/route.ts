import { staffSchema } from "@/domain/model";
import { HttpError, json, parseBody, salonRoute } from "@/lib/http";
import { saveStaff } from "@/services/settings";

export const dynamic = "force-dynamic";

export const PUT = salonRoute(async ({ ctx }, request: Request, context: RouteContext<"/api/staff/[id]">) => {
  const { id } = await context.params;
  const body = await parseBody(request, staffSchema);
  if (body.id !== id) throw new HttpError(400, "El id no coincide");
  return json(await saveStaff(ctx, body));
});
