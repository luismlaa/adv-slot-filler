import { z } from "zod";
import { demoDeps } from "@/lib/demo";
import { json, parseBody, route } from "@/lib/http";
import { STEP_IDS, runStep } from "@/services/demo-script";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ step: z.enum(STEP_IDS) });

export const POST = route(async (request: Request) => {
  const { step } = await parseBody(request, bodySchema);
  return json(await runStep(demoDeps(), step));
});
