import { normalizeText } from "@/domain/text";
import { json, salonRoute } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Búsqueda de clientes por nombre o teléfono (para reservas desde el salón). */
export const GET = salonRoute(async ({ ctx }, request: Request) => {
  const q = normalizeText(new URL(request.url).searchParams.get("q") ?? "");
  const clients = await ctx.store.clients.list();
  const digits = q.replace(/\D/g, "");
  const matches = clients.filter((c) => (q === "" ? true : normalizeText(c.name).includes(q) || (digits.length >= 3 && c.phone.includes(digits))));
  return json(matches.slice(0, 12).map((c) => ({ id: c.id, name: c.name, phone: c.phone })));
});
