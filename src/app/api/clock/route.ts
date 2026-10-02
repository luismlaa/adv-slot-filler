import { toIso } from "@/domain/time";
import { getContainer } from "@/lib/container";
import { json, salonRoute } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Hora "actual" del salón (simulada en la demo) para que toda la UI use el mismo reloj. */
export const GET = salonRoute(async () => {
  const { ctx, env } = getContainer();
  const salon = await ctx.store.salon.get();
  return json({ now: toIso(ctx.clock.now()), timezone: salon.timezone, salonName: salon.name, demo: env.DEMO_MODE && env.DATA_BACKEND === "memory" });
});
