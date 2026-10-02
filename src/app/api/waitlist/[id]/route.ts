import { getContainer } from "@/lib/container";
import { HttpError, json, route } from "@/lib/http";
import { publish } from "@/services/data";

export const dynamic = "force-dynamic";

export const DELETE = route(async (_request: Request, context: RouteContext<"/api/waitlist/[id]">) => {
  const { ctx } = getContainer();
  const { id } = await context.params;
  const updated = await ctx.store.waitlist.update(id, { status: "cancelled" });
  if (!updated) throw new HttpError(404, "No existe esa entrada");
  publish(ctx, "waitlist.changed", { id });
  return json(updated);
});
