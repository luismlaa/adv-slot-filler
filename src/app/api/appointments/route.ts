import { z } from "zod";
import { idSchema, instantSchema, phoneSchema } from "@/domain/model";
import { normalizePhone } from "@/domain/text";
import { toIso } from "@/domain/time";
import { getContainer } from "@/lib/container";
import { HttpError, json, parseBody, salonRoute } from "@/lib/http";
import { bookAppointment } from "@/services/booking";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  staffId: idSchema,
  serviceId: idSchema,
  start: instantSchema,
  clientId: idSchema.optional(),
  newClient: z.object({ name: z.string().min(1), phone: z.string().min(7) }).optional(),
  walkIn: z.boolean().default(false),
});

/** Reserva hecha desde el salón (recepción o el propio barbero). */
export const POST = salonRoute(async (request: Request) => {
  const { ctx } = getContainer();
  const body = await parseBody(request, bodySchema);
  let clientId = body.clientId;
  if (!clientId) {
    if (!body.newClient) throw new HttpError(400, "Indica un cliente existente o uno nuevo");
    const phone = phoneSchema.parse(normalizePhone(body.newClient.phone));
    const existing = await ctx.store.clients.findByPhone(phone);
    clientId = existing?.id;
    if (!clientId) {
      const created = await ctx.store.clients.insert({
        id: ctx.ids.newId(),
        salonId: ctx.store.salonId,
        name: body.newClient.name,
        phone,
        optedOut: false,
        createdAt: toIso(ctx.clock.now()),
      });
      clientId = created.id;
    }
  }
  const result = await bookAppointment(ctx, { clientId, staffId: body.staffId, serviceId: body.serviceId, start: body.start, source: body.walkIn ? "walkin" : "salon" });
  if (!result.ok) throw new HttpError(409, result.reason === "unavailable" ? "Ese espacio ya no está libre" : `No se pudo reservar (${result.reason})`);
  return json(result.appointment, 201);
});
