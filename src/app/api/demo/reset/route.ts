import { json, requireDemo, route } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Vuelve la demo al estado inicial (mismos datos de siempre: el seed es determinista). */
export const POST = route(async () => {
  requireDemo().reset();
  return json({ ok: true });
});
