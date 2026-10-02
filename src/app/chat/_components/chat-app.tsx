"use client";

import { LiveProvider } from "@/components/live/live-provider";
import type { ChatContact } from "@/lib/demo-contacts";
import { ChatList } from "./chat-list";
import { ChatWindow } from "./chat-window";

interface Props {
  contact: ChatContact | undefined;
  salonName: string;
  timezone: string;
}

/** Marco tipo WhatsApp Web: columna centrada a pantalla completa en el celular. */
export function ChatApp({ contact, salonName, timezone }: Props) {
  return (
    <LiveProvider>
      <div className="flex h-dvh w-full justify-center bg-[#d1d7db]">
        <div className="flex h-full w-full max-w-xl flex-col bg-[#efeae2] text-[#111b21] shadow-xl">
          {contact ? (
            <ChatWindow key={contact.phone} contact={contact} salonName={salonName} timezone={timezone} />
          ) : (
            <ChatList salonName={salonName} timezone={timezone} />
          )}
        </div>
      </div>
    </LiveProvider>
  );
}
