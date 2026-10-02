import { localDateSchema } from "@/domain/model";
import { getContainer } from "@/lib/container";
import { json, route } from "@/lib/http";
import { boardView } from "@/services/views/board";

export const dynamic = "force-dynamic";

export const GET = route(async (request: Request) => {
  const date = new URL(request.url).searchParams.get("date");
  return json(await boardView(getContainer().ctx, date ? localDateSchema.parse(date) : undefined));
});
