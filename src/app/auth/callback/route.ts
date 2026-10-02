import { getEnv } from "@/config/env";
import { createSessionClient } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Vuelta del enlace mágico: canjea el código por una sesión (cookies) y entra al panel. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next");
  const safeNext = next?.startsWith("/") && !next.startsWith("//") ? next : "/agenda";
  if (code) {
    const supabase = await createSessionClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return Response.redirect(new URL(safeNext, getEnv().APP_URL), 302);
  }
  return Response.redirect(new URL("/login?error=1", getEnv().APP_URL), 302);
}
