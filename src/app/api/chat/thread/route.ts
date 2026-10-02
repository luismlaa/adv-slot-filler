import { phoneSchema } from "@/domain/model";
import { getContainer } from "@/lib/container";
import { json, requireDemo, route } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Conversación de WhatsApp de un teléfono, tal como la ve el cliente (demo). */
export const GET = route(async (request: Request) => {
  requireDemo();
  const phone = phoneSchema.parse(new URL(request.url).searchParams.get("phone"));
  const { ctx } = getContainer();
  const [messages, client] = await Promise.all([ctx.store.messages.list({ phone, limit: 80 }), ctx.store.clients.findByPhone(phone)]);
  return json({ phone, clientName: client?.name ?? null, messages: messages.map((m) => ({ id: m.id, direction: m.direction, text: m.text, at: m.at, purpose: m.purpose })) });
});

