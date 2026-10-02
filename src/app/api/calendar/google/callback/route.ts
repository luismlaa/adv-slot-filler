import { cookies } from "next/headers";
import { exchangeCode } from "@/adapters/calendar/google";
import { getContainer } from "@/lib/container";
import { HttpError, salonRoute } from "@/lib/http";
import { recordActivity } from "@/services/activity";

export const dynamic = "force-dynamic";

/** Vuelta de Google: valida el `state` contra la cookie (anti-CSRF), guarda el refresh token y sincroniza. */
export const GET = salonRoute(async ({ ctx, calendarSync }, request: Request) => {
  const { env } = getContainer();
  if (env.CALENDAR_PROVIDER !== "google") throw new HttpError(404, "Google Calendar no está configurado");
  const params = new URL(request.url).searchParams;
  const [nonce, staffId] = (params.get("state") ?? "").split(".");
  const jar = await cookies();
  const expected = jar.get("gcal_state")?.value;
  jar.delete("gcal_state");
  if (!nonce || !staffId || nonce !== expected) throw new HttpError(400, "Estado OAuth inválido");
  const code = params.get("code");
  if (!code) throw new HttpError(400, params.get("error") ?? "Google no devolvió código");
  const refreshToken = await exchangeCode({ clientId: env.GOOGLE_CLIENT_ID!, clientSecret: env.GOOGLE_CLIENT_SECRET!, redirectUri: env.GOOGLE_REDIRECT_URI! }, code);
  await calendarSync.connect(staffId, "primary", refreshToken);
  await recordActivity(ctx, "calendar.connected", "Se conectó un Google Calendar: las citas se reflejan ahí y sus eventos personales bloquean la agenda.", { staffId }, "success");
  return Response.redirect(new URL("/ajustes", env.APP_URL), 302);
});
