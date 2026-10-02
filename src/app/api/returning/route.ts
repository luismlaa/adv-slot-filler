import { localDateSchema } from "@/domain/model";
import { getContainer } from "@/lib/container";
import { json, salonRoute } from "@/lib/http";
import { returningView } from "@/services/views/returning";

export const dynamic = "force-dynamic";

export const GET = salonRoute(async (request: Request) => {
  const week = new URL(request.url).searchParams.get("week");
  return json(await returningView(getContainer().ctx, week ? localDateSchema.parse(week) : undefined));
});
