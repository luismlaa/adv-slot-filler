import { z } from "zod";
import { idSchema, instantSchema } from "@/domain/model";
import { toIso } from "@/domain/time";
import { json, parseBody, salonRoute } from "@/lib/http";
import { recordActivity } from "@/services/activity";
import { publish } from "@/services/data";
import { runGap } from "@/services/gapfill";
import { waitlistView } from "@/services/views/waitlist";

export const dynamic = "force-dynamic";

export const GET = salonRoute(async ({ ctx }) => json(await waitlistView(ctx)));

const bodySchema = z
  .object({ clientId: idSchema, serviceId: idSchema, staffIds: z.array(idSchema).default([]), windowStart: instantSchema, windowEnd: instantSchema })
  .refine((b) => b.windowStart < b.windowEnd, "La ventana debe terminar después de empezar");

export const POST = salonRoute(async ({ ctx }, request: Request) => {
  const body = await parseBody(request, bodySchema);
  const entry = await ctx.store.waitlist.insert({ id: ctx.ids.newId(), salonId: ctx.store.salonId, ...body, status: "active", createdAt: toIso(ctx.clock.now()) });
  publish(ctx, "waitlist.changed", { id: entry.id });
  const client = await ctx.store.clients.get(body.clientId);
  await recordActivity(ctx, "waitlist.joined", `El salón anotó a ${client?.name ?? "un cliente"} en lista de espera.`, { clientId: body.clientId });
  // Si ya hay un hueco abierto que le sirve, que entre en la próxima ola.
  for (const gap of await ctx.store.gaps.list(["open"])) await runGap(ctx, gap.id);
  return json(entry, 201);
});
