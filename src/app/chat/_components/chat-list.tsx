"use client";

import Link from "next/link";
import { useLiveQuery } from "@/components/live/live-provider";
import { labelAt } from "@/lib/client-format";
import type { ChatContact } from "@/lib/demo-contacts";
import { Avatar } from "./avatar";
import { plainText } from "./rich-text";

interface Contacts {
  contacts: (ChatContact & { last: { text: string; at: string; direction: "in" | "out" } | null })[];
}

/** «¿Quién eres?»: la lista de chats, un teléfono por cliente. */
export function ChatList({ salonName, timezone }: { salonName: string; timezone: string }) {
  const { data } = useLiveQuery<Contacts>("/api/chat/contacts", ["message.in", "message.out", "demo.reset"]);
  return (
    <>
      <header className="bg-[#075e54] px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] text-white shadow">
        <h1 className="text-lg font-semibold">WhatsApp</h1>
        <p className="text-xs text-white/80">Elige un cliente para escribirle a {salonName}</p>
      </header>
      <ul className="flex-1 divide-y divide-[#e9edef] overflow-y-auto bg-white" aria-label="Chats">
        {(data?.contacts ?? []).map((c) => (
          <li key={c.phone}>
            <Link href={`/chat?tel=${encodeURIComponent(c.phone)}`} className="flex items-center gap-3 px-4 py-3 hover:bg-[#f5f6f6]">
              <Avatar name={c.name} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-[16px] font-medium">{c.name}</span>
                  {c.last && <span className="shrink-0 text-xs text-[#667781]">{labelAt(c.last.at, timezone)}</span>}
                </div>
                <p className="truncate text-sm text-[#667781]">
                  {c.last ? `${c.last.direction === "in" ? "Tú: " : ""}${plainText(c.last.text)}` : c.phone}
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
