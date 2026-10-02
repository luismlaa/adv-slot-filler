import { z } from "zod";
import { phoneSchema } from "@/domain/model";
import { getContainer } from "@/lib/container";
import { json, parseBody, requireDemo, route } from "@/lib/http";
import { simulateInbound } from "@/services/demo-script";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ phone: phoneSchema, text: z.string().min(1).max(500), profileName: z.string().max(60).optional() });

/** El presentador escribe como cliente: entra por el mismo camino que un webhook de WhatsApp. */
export const POST = route(async (request: Request) => {
  requireDemo();
  const body = await parseBody(request, bodySchema);
  const result = await simulateInbound(getContainer().ctx, body.phone, body.text, body.profileName);
  return json({ replies: result.replies, intent: result.interpretation?.intent ?? null, confidence: result.interpretation?.confidence ?? null });
});
