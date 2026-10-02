import { z } from "zod";
import { DAY, localDateOf, toIso, zonedInstant } from "@/domain/time";
import { instantSchema, localDateSchema } from "@/domain/model";
import { demoDeps } from "@/lib/demo";
import { HttpError, json, parseBody, route } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Lo que Carlos vería abriendo su Google Calendar ese día (simulado). */
export const GET = route(async (request: Request) => {
  const deps = await demoDeps();
  if (!deps.calendar) throw new HttpError(404, "Sin calendario simulado");
  const salon = await deps.ctx.store.salon.get();
  const dateParam = new URL(request.url).searchParams.get("date");
  const date = dateParam ? localDateSchema.parse(dateParam) : localDateOf(deps.ctx.clock.now(), salon.timezone);
  const from = zonedInstant(date, "00:00", salon.timezone);
  return json({ date, calendarId: deps.calendarId, events: deps.calendar.visibleEvents(deps.calendarId, toIso(from), toIso(from + DAY)) });
});

const addSchema = z.object({ title: z.string().min(1).max(60), start: instantSchema, end: instantSchema }).refine((b) => b.start < b.end, "Rango inválido");

/** Carlos agrega un evento personal en su calendario → push → sync → bloqueo en la agenda. */
export const POST = route(async (request: Request) => {
  const deps = await demoDeps();
  if (!deps.calendar) throw new HttpError(404, "Sin calendario simulado");
  const body = await parseBody(request, addSchema);
  const event = deps.calendar.addPersonalEvent(deps.calendarId, body);
  await deps.calendarSync.syncStaff(deps.calendarStaffId);
  return json(event, 201);
});

const deleteSchema = z.object({ eventId: z.string().min(1) });

export const DELETE = route(async (request: Request) => {
  const deps = await demoDeps();
  if (!deps.calendar) throw new HttpError(404, "Sin calendario simulado");
  const { eventId } = await parseBody(request, deleteSchema);
  deps.calendar.removeEvent(deps.calendarId, eventId);
  await deps.calendarSync.syncStaff(deps.calendarStaffId);
  return json({ deleted: eventId });
});
