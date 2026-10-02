import { cookies } from "next/headers";
import { buildAuthUrl } from "@/adapters/calendar/google";
import { getContainer } from "@/lib/container";
import { HttpError, salonRoute } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Inicia el consentimiento OAuth para el calendario de un estilista. Fase D3 (requiere app verificada). */
export const GET = salonRoute(async ({ ctx }, request: Request) => {
  const { env } = getContainer();
  if (env.CALENDAR_PROVIDER !== "google") throw new HttpError(404, "Google Calendar no está configurado");
  const staffId = new URL(request.url).searchParams.get("staffId");
  const staff = await ctx.store.staff.list();
  if (!staffId || !staff.some((s) => s.id === staffId)) throw new HttpError(400, "Estilista inválido");
  const nonce = crypto.randomUUID();
  (await cookies()).set("gcal_state", nonce, { httpOnly: true, sameSite: "lax", secure: env.NODE_ENV === "production", maxAge: 600, path: "/" });
  const url = buildAuthUrl({ clientId: env.GOOGLE_CLIENT_ID!, clientSecret: env.GOOGLE_CLIENT_SECRET!, redirectUri: env.GOOGLE_REDIRECT_URI! }, `${nonce}.${staffId}`);
  return Response.redirect(url, 302);
});
