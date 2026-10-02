import { getContainer } from "@/lib/container";
import { HttpError, json, route } from "@/lib/http";
import { publish } from "@/services/data";

export const dynamic = "force-dynamic";

/** Solo se borran bloqueos manuales; los del calendario se quitan borrando el evento en el calendario. */
export const DELETE = route(async (_request: Request, context: RouteContext<"/api/blocks/[id]">) => {
  const { ctx } = getContainer();
  const { id } = await context.params;
  const block = (await ctx.store.blocks.list()).find((b) => b.id === id);
  if (!block) throw new HttpError(404, "No existe ese bloqueo");
  if (block.source !== "manual") throw new HttpError(409, "Ese bloqueo viene del calendario del estilista; bórralo allá.");
  await ctx.store.blocks.delete(id);
  publish(ctx, "block.changed", { staffId: block.staffId });
  return json({ deleted: id });
});
