import { z } from "zod";
import { getContainer } from "@/lib/container";
import { json, parseBody, route } from "@/lib/http";
import { publish } from "@/services/data";
import { updateBusinessSettings } from "@/services/settings";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  const { ctx } = getContainer();
  const [salon, config, staff, services, specialties, calendarLinks] = await Promise.all([
    ctx.store.salon.get(),
    ctx.config(),
    ctx.store.staff.list(),
    ctx.store.services.list(),
    ctx.store.specialties.list(),
    ctx.store.calendarLinks.list(),
  ]);
  return json({
    salon: { id: salon.id, name: salon.name, timezone: salon.timezone, currency: salon.currency, phone: salon.phone, address: salon.address },
    config,
    staff,
    services,
    specialties,
    calendarLinks: calendarLinks.map((link) => ({ ...link, refreshToken: link.refreshToken ? "[guardado]" : undefined })),
  });
});

/** Overrides parciales; el resultado completo se valida con el esquema de negocio. */
const bodySchema = z.record(z.string(), z.record(z.string(), z.unknown()));

export const PUT = route(async (request: Request) => {
  const { ctx } = getContainer();
  const body = await parseBody(request, bodySchema);
  const config = await updateBusinessSettings(ctx, body);
  publish(ctx, "activity", { kind: "settings.updated" });
  return json(config);
});
