import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getEnv } from "@/config/env";
import type { Membership } from "@/ports";
import { getContainer } from "./container";
import { HttpError } from "./http-error";

/** Cliente Supabase con la sesión del usuario (cookies). Solo para auth; los datos van por el Store. */
export async function createSessionClient() {
  const env = getEnv();
  const jar = await cookies();
  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) jar.set(name, value, options);
        } catch {
          // Desde un Server Component no se pueden escribir cookies; el proxy refresca la sesión.
        }
      },
    },
  });
}

export interface SalonMember {
  readonly userId: string;
  readonly email: string | undefined;
  readonly salonId: string;
  readonly role: Membership["role"];
  readonly staffId: string | undefined;
}

/** Cookie con el salón elegido, para usuarios que pertenecen a más de uno (p. ej. dueño de dos sucursales). */
export const ACTIVE_SALON_COOKIE = "sf_salon";

/**
 * Autorización cerca de los datos: el usuario debe tener sesión y ser miembro de un salón activo.
 * El salón sale de su membresía (multi-tenant), nunca de un parámetro del navegador.
 * En la demo (sin Supabase) no hay usuarios: devuelve `undefined` y se usa el salón del seed.
 */
export async function requireSalonMember(): Promise<SalonMember | undefined> {
  const env = getEnv();
  if (env.DEMO_MODE && env.DATA_BACKEND === "memory") return undefined;
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_ANON_KEY) throw new HttpError(500, "Autenticación no configurada");
  const session = await createSessionClient();
  const { data, error } = await session.auth.getUser();
  if (error || !data.user) throw new HttpError(401, "Inicia sesión para continuar");
  const memberships = await getContainer().directory.membershipsOf(data.user.id);
  if (memberships.length === 0) throw new HttpError(403, "Tu usuario no tiene acceso a ningún salón");
  const preferred = (await cookies()).get(ACTIVE_SALON_COOKIE)?.value;
  const membership = memberships.find((m) => m.salonId === preferred) ?? memberships[0]!;
  return { userId: data.user.id, email: data.user.email, salonId: membership.salonId, role: membership.role, staffId: membership.staffId };
}
