import { type NextRequest, NextResponse } from "next/server";

/** Pantallas del salón: requieren sesión fuera de la demo. */
const PROTECTED = ["/agenda", "/por-volver", "/lista-espera", "/metricas", "/ajustes", "/barbero"];

/**
 * Chequeo optimista de sesión (presencia de la cookie de Supabase Auth) para redirigir al login.
 * La autorización real — ser miembro del salón — se verifica en cada route handler, junto a los datos.
 */
export function proxy(request: NextRequest) {
  const demo = process.env.DEMO_MODE === "true" && (process.env.DATA_BACKEND ?? "memory") === "memory";
  if (demo) return NextResponse.next();
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/demo")) return NextResponse.redirect(new URL("/agenda", request.url));
  if (!PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return NextResponse.next();
  const hasSession = request.cookies.getAll().some((c) => c.name.startsWith("sb-") && c.name.includes("auth-token"));
  if (hasSession) return NextResponse.next();
  const login = new URL("/login", request.url);
  login.searchParams.set("next", pathname);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
