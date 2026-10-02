import { json, salonRoute } from "@/lib/http";

export const dynamic = "force-dynamic";

export const GET = salonRoute(async ({ ctx }, request: Request) => {
  const limit = Math.min(200, Number(new URL(request.url).searchParams.get("limit") ?? 40) || 40);
  return json(await ctx.store.activity.list(limit));
});
