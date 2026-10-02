import { localDateSchema } from "@/domain/model";
import { json, salonRoute } from "@/lib/http";
import { boardView } from "@/services/views/board";

export const dynamic = "force-dynamic";

export const GET = salonRoute(async ({ ctx }, request: Request) => {
  const date = new URL(request.url).searchParams.get("date");
  return json(await boardView(ctx, date ? localDateSchema.parse(date) : undefined));
});
