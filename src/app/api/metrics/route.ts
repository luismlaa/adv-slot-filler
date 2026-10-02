import { localDateSchema } from "@/domain/model";
import { getContainer } from "@/lib/container";
import { json, salonRoute } from "@/lib/http";
import { metricsView } from "@/services/views/metrics";

export const dynamic = "force-dynamic";

export const GET = salonRoute(async (request: Request) => {
  const params = new URL(request.url).searchParams;
  const from = params.get("from");
  const to = params.get("to");
  return json(
    await metricsView(getContainer().ctx, {
      from: from ? localDateSchema.parse(from) : undefined,
      to: to ? localDateSchema.parse(to) : undefined,
    }),
  );
});
