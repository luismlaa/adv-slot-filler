"use client";

import Link from "next/link";
import { Fragment, useEffect, useRef, useState } from "react";
import { sendJson, useLiveQuery } from "@/components/live/live-provider";
import { useSalonClock } from "@/components/shell/use-salon-clock";
import { addDays, localDateIn, shortDate } from "@/lib/client-format";
import type { ChatContact } from "@/lib/demo-contacts";
import { type ChatMessage, MessageBubble } from "./message-bubble";
import { QuickReplies, suggestionsFor } from "./quick-replies";
import { TypingIndicator } from "./typing-indicator";

interface Thread {
  messages: (ChatMessage & { purpose: string })[];
}

/** Lo mínimo que el agente "escribe", para que se sienta como una persona y no como un formulario. */
const MIN_TYPING_MS = 900;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface Pending {
  readonly text: string;
  /** Mensajes que ya existían al enviar: las respuestas nuevas se esconden mientras «escribe». */
  readonly known: ReadonlySet<string>;
}

export function ChatWindow({ contact, salonName, timezone }: { contact: ChatContact; salonName: string; timezone: string }) {
  const thread = useLiveQuery<Thread>(`/api/chat/thread?phone=${encodeURIComponent(contact.phone)}`, ["message.in", "message.out", "demo.reset"]);
  const clock = useSalonClock();
  const [text, setText] = useState("");
  const [pending, setPending] = useState<Pending>();
  const [error, setError] = useState<string>();
  const bottom = useRef<HTMLDivElement>(null);

  const all = thread.data?.messages ?? [];
  const visible = pending ? all.filter((m) => pending.known.has(m.id) || m.direction === "in") : all;
  const showOptimistic = pending && !visible.some((m) => m.direction === "in" && !pending.known.has(m.id));
  const lastKey = `${visible.at(-1)?.id}-${pending ? 1 : 0}`;

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [lastKey]);

  const send = async (body: string) => {
    const clean = body.trim();
    if (!clean || pending) return;
    setText("");
    setError(undefined);
    setPending({ text: clean, known: new Set(all.map((m) => m.id)) });
    try {
      await Promise.all([sendJson("/api/chat/send", "POST", { phone: contact.phone, text: clean, profileName: contact.name }), sleep(MIN_TYPING_MS)]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo enviar el mensaje");
    } finally {
      setPending(undefined);
      thread.reload();
    }
  };

  const today = clock ? localDateIn(clock.now, timezone) : undefined;
  const dayLabel = (date: string) => (date === today ? "Hoy" : today && date === addDays(today, -1) ? "Ayer" : today && date === addDays(today, 1) ? "Mañana" : shortDate(date));
  const lastFromSalon = [...visible].reverse().find((m) => m.direction === "out")?.text;

  return (
    <>
      <header className="flex items-center gap-2 bg-[#075e54] px-2 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] text-white shadow">
        <Link href="/chat" aria-label="Volver a los chats" className="flex size-9 items-center justify-center rounded-full hover:bg-white/10">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden>
            <path d="M12 4l1.4 1.4L7.8 11H20v2H7.8l5.6 5.6L12 20l-8-8 8-8z" />
          </svg>
        </Link>
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white text-xl" aria-hidden>
          💈
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-semibold leading-tight">{salonName}</h1>
          <p className="truncate text-xs text-white/80">{pending ? "escribiendo…" : `en línea · chateas como ${contact.name}`}</p>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-[4%] py-3" aria-live="polite" aria-label={`Chat de ${contact.name}`}>
        {visible.map((m, i) => {
          const prev = visible[i - 1];
          const date = localDateIn(m.at, timezone);
          const newDay = !prev || localDateIn(prev.at, timezone) !== date;
          return (
            <Fragment key={m.id}>
              {newDay && (
                <div className="my-3 flex justify-center">
                  <span className="rounded-lg bg-white px-3 py-1 text-xs uppercase text-[#54656f] shadow-sm">{dayLabel(date)}</span>
                </div>
              )}
              <MessageBubble message={m} timezone={timezone} first={newDay || prev?.direction !== m.direction} />
            </Fragment>
          );
        })}
        {showOptimistic && pending && clock && (
          <MessageBubble message={{ id: "pending", direction: "in", text: pending.text, at: clock.now }} timezone={timezone} first={visible.at(-1)?.direction !== "in"} />
        )}
        {pending && (
          <div className="mt-2">
            <TypingIndicator />
          </div>
        )}
        {error && <p className="mx-auto mt-3 max-w-[85%] rounded-lg bg-[#fff3c4] px-3 py-2 text-center text-sm text-[#54656f] shadow-sm">{error}</p>}
        <div ref={bottom} />
      </main>

      <footer className="bg-[#f0f2f5] px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2">
        <QuickReplies options={suggestionsFor(lastFromSalon)} disabled={Boolean(pending)} onPick={(t) => void send(t)} />
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void send(text);
          }}
        >
          <textarea
            rows={1}
            maxLength={500}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(text);
              }
            }}
            placeholder="Escribe un mensaje"
            aria-label="Escribe un mensaje"
            className="max-h-32 min-h-11 flex-1 resize-none rounded-3xl bg-white px-4 py-2.5 text-[15px] leading-6 outline-none placeholder:text-[#8696a0] focus:ring-2 focus:ring-[#25d366]/50"
          />
          <button type="submit" aria-label="Enviar" disabled={Boolean(pending) || !text.trim()} className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#00a884] text-white disabled:opacity-50">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden>
              <path d="M2.01 21 23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
          </button>
        </form>
      </footer>
    </>
  );
}
