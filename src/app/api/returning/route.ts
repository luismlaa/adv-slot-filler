import { localDateSchema } from "@/domain/model";
import { json, salonRoute } from "@/lib/http";
import { returningView } from "@/services/views/returning";

export const dynamic = "force-dynamic";

export const GET = salonRoute(async ({ ctx }, request: Request) => {
  const week = new URL(request.url).searchParams.get("week");
  return json(await returningView(ctx, week ? localDateSchema.parse(week) : undefined));
});
