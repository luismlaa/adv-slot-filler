import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { demoScope, getContainer } from "@/lib/container";
import { contactByPhone } from "@/lib/demo-contacts";
import { ChatApp } from "./_components/chat-app";

export const metadata: Metadata = { title: "WhatsApp · Slot Filler" };
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#075e54" };
export const dynamic = "force-dynamic";

/**
 * WhatsApp del cliente (solo demo): lo que escribe aquí entra por el mismo camino que un webhook
 * real y el agente responde igual que en producción. En producción el canal es WhatsApp de verdad.
 */
export default async function ChatPage({ searchParams }: PageProps<"/chat">) {
  const { env, demo } = getContainer();
  if (!env.DEMO_MODE || !demo) notFound();
  const { ctx } = await demoScope();
  const { tel } = await searchParams;
  const contact = contactByPhone(typeof tel === "string" ? tel : undefined);
  const salon = await ctx.store.salon.get();
  return <ChatApp contact={contact} salonName={salon.name} timezone={salon.timezone} />;
}
