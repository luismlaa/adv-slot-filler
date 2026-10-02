import { getContainer } from "@/lib/container";
import { CHAT_CONTACTS } from "@/lib/demo-contacts";
import { json, requireDemo, route } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Lista de chats (demo): cada cliente con su último mensaje, como la pantalla principal de WhatsApp. */
export const GET = route(async () => {
  requireDemo();
  const { ctx } = getContainer();
  const contacts = await Promise.all(
    CHAT_CONTACTS.map(async (contact) => {
      const last = (await ctx.store.messages.list({ phone: contact.phone, limit: 1 })).at(-1);
      return { ...contact, last: last ? { text: last.text, at: last.at, direction: last.direction } : null };
    }),
  );
  // Como WhatsApp: el chat con el mensaje más reciente arriba; los que nunca escribieron, al final.
  const sorted = [...contacts].sort((a, b) => (b.last?.at ?? "").localeCompare(a.last?.at ?? ""));
  return json({ contacts: sorted });
});
