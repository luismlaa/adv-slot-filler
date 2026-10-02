import "server-only";
import { ZodError, type z } from "zod";
import { requireSalonMember } from "./auth";
import { getContainer } from "./container";
import { HttpError } from "./http-error";

export { HttpError };

export const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });

/** Valida el cuerpo JSON con zod en la frontera; nunca se confía en lo que manda el navegador. */
export async function parseBody<S extends z.ZodType>(request: Request, schema: S): Promise<z.infer<S>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new HttpError(400, "El cuerpo debe ser JSON válido");
  }
  return schema.parse(raw);
}

/** Envuelve un handler: errores de validación → 400, HttpError → su status, el resto → 500 con log. */
export function route<Args extends unknown[]>(handler: (...args: Args) => Promise<Response>) {
  return async (...args: Args): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (error) {
      if (error instanceof ZodError) return json({ error: "Datos inválidos", issues: error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) }, 400);
      if (error instanceof HttpError) return json({ error: error.message }, error.status);
      getContainer().ctx.logger.error("Error no controlado en API", { error: error instanceof Error ? error.message : String(error) });
      return json({ error: "Error interno" }, 500);
    }
  };
}

/** Igual que `route`, pero exige un miembro del salón con sesión (en producción). */
export function salonRoute<Args extends unknown[]>(handler: (...args: Args) => Promise<Response>) {
  return route(async (...args: Args) => {
    await requireSalonMember();
    return handler(...args);
  });
}

/** Rutas que solo existen en modo demo (reloj simulado, reset, teléfono simulado). */
export function requireDemo() {
  const container = getContainer();
  if (!container.env.DEMO_MODE || !container.demo) throw new HttpError(404, "Solo disponible en modo demo");
  return container.demo;
}

/** Jobs programados: en producción exigen `Authorization: Bearer <CRON_SECRET>`. */
export function requireCron(request: Request) {
  const { env } = getContainer();
  if (env.DEMO_MODE && !env.CRON_SECRET) return;
  if (request.headers.get("authorization") !== `Bearer ${env.CRON_SECRET}`) throw new HttpError(401, "No autorizado");
}
