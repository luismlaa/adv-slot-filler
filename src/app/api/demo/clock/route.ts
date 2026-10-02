import { z } from "zod";
import { demoDeps } from "@/lib/demo";
import { json, parseBody, route } from "@/lib/http";
import { advanceClock } from "@/services/demo-script";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ minutes: z.number().int().positive().max(60 * 24 * 60) });

/** Avanza el reloj simulado y corre los jobs (cierre de citas, vencimiento de ofertas, invitaciones). */
export const POST = route(async (request: Request) => {
  const { minutes } = await parseBody(request, bodySchema);
  const report = await advanceClock(demoDeps(), minutes * 60_000);
  return json(report);
});
