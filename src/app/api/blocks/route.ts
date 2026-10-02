import { z } from "zod";
import { firstNameOf, formatWhen } from "@/domain/conversation";
import { idSchema, instantSchema } from "@/domain/model";
import { fromIso, localDateOf, overlaps, toIso } from "@/domain/time";
import { HttpError, json, parseBody, salonRoute } from "@/lib/http";
import { recordActivity } from "@/services/activity";
import { publish } from "@/services/data";

export const dynamic = "force-dynamic";

const bodySchema = z
  .object({ staffId: idSchema, start: instantSchema, end: instantSchema, title: z.string().min(1).max(80) })
  .refine((b) => b.start < b.end, "El bloqueo debe terminar después de empezar");

/** El estilista bloquea tiempo (diligencia, descanso). No se permite encima de citas reservadas. */
export const POST = salonRoute(async ({ ctx }, request: Request) => {
  const body = await parseBody(request, bodySchema);
  const interval = { start: fromIso(body.start), end: fromIso(body.end) };
  const booked = await ctx.store.appointments.list({ staffId: body.staffId, from: body.start, to: body.end, statuses: ["booked"] });
  if (booked.some((a) => overlaps(interval, { start: fromIso(a.start), end: fromIso(a.end) }))) {
    throw new HttpError(409, "Hay citas reservadas en ese horario. Cancélalas o muévelas primero.");
  }
  const block = await ctx.store.blocks.upsert({ id: ctx.ids.newId(), salonId: ctx.store.salonId, ...body, source: "manual", createdAt: toIso(ctx.clock.now()) });
  const [staff, salon] = await Promise.all([ctx.store.staff.list(), ctx.store.salon.get()]);
  publish(ctx, "block.changed", { staffId: body.staffId });
  await recordActivity(
    ctx,
    "block.created",
    `${firstNameOf(staff.find((s) => s.id === body.staffId)?.name ?? "")} bloqueó ${formatWhen(body.start, salon.timezone, localDateOf(ctx.clock.now(), salon.timezone))}: «${body.title}».`,
    { staffId: body.staffId },
  );
  return json(block, 201);
});
