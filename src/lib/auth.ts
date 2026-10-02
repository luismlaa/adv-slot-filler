import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createServiceClient } from "@/adapters/supabase/client";
import { getEnv } from "@/config/env";
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
  readonly role: "owner" | "reception" | "staff";
  readonly staffId: string | undefined;
}

/**
 * Autorización cerca de los datos: el usuario debe tener sesión y ser miembro del salón de esta
 * instancia. En la demo (sin Supabase) no hay usuarios y todo está abierto.
 */
export async function requireSalonMember(): Promise<SalonMember | undefined> {
  const env = getEnv();
  if (env.DEMO_MODE && env.DATA_BACKEND === "memory") return undefined;
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_ANON_KEY) throw new HttpError(500, "Autenticación no configurada");
  const session = await createSessionClient();
  const { data, error } = await session.auth.getUser();
  if (error || !data.user) throw new HttpError(401, "Inicia sesión para continuar");
  const service = createServiceClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY!);
  const membership = await service
    .from("salon_members")
    .select("role, staff_id")
    .eq("salon_id", env.SALON_ID!)
    .eq("user_id", data.user.id)
    .maybeSingle();
  if (membership.error || !membership.data) throw new HttpError(403, "Tu usuario no tiene acceso a este salón");
  const row = membership.data as { role: SalonMember["role"]; staff_id: string | null };
  return { userId: data.user.id, email: data.user.email, role: row.role, staffId: row.staff_id ?? undefined };
}
