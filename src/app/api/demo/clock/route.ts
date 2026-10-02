import { z } from "zod";
import { phoneSchema } from "@/domain/model";
import { demoDeps } from "@/lib/demo";
import { HttpError, json, parseBody, route } from "@/lib/http";
import { advanceClock, advanceToClientCycle } from "@/services/demo-script";

export const dynamic = "force-dynamic";

const bodySchema = z.union([
  z.object({ minutes: z.number().int().positive().max(60 * 24 * 60) }),
  z.object({ untilCycleOf: phoneSchema }),
]);

/**
 * Avanza el reloj simulado y corre los jobs (cierre de citas, vencimiento de ofertas, invitaciones).
 * `untilCycleOf` salta a la mañana en que a ese cliente le toca volver según su ciclo.
 */
export const POST = route(async (request: Request) => {
  const body = await parseBody(request, bodySchema);
  const deps = demoDeps();
  if ("minutes" in body) return json(await advanceClock(deps, body.minutes * 60_000));
  const client = await deps.ctx.store.clients.findByPhone(body.untilCycleOf);
  if (!client) throw new HttpError(404, "Ese cliente todavía no tiene historial en el salón");
  return json(await advanceToClientCycle(deps, client.id));
});
