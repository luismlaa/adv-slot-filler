"use client";

import { useEffect, useRef, useState } from "react";
import { sendJson, useLiveEvents, useLiveQuery } from "@/components/live/live-provider";
import { cx } from "@/components/ui/primitives";
import { labelAt } from "@/lib/client-format";

export interface Persona {
  readonly key: string;
  readonly name: string;
  readonly phone: string;
}

interface Thread {
  phone: string;
  clientName: string | null;
  messages: { id: string; direction: "in" | "out"; text: string; at: string; purpose: string }[];
}

const QUICK = ["Sí", "No", "la 1", "la 2", "cancelar", "BAJA"];

/** Renderiza *negritas* de WhatsApp. */
function Rich({ text }: { text: string }) {
  const parts = text.split(/(\*[^*]+\*)/g);
  return (
    <>
      {parts.map((p, i) => (p.startsWith("*") && p.endsWith("*") ? <strong key={i}>{p.slice(1, -1)}</strong> : <span key={i}>{p}</span>))}
    </>
  );
}

interface Props {
  personas: readonly Persona[];
  active: string;
  onActiveChange: (key: string) => void;
  salonName: string;
  timezone: string;
}

/** El teléfono del cliente: lo que él ve en WhatsApp. Lo que escribe aquí entra igual que un webhook real. */
export function PhoneSimulator({ personas, active, onActiveChange, salonName, timezone }: Props) {
  const persona = personas.find((p) => p.key === active) ?? personas[0]!;
  const thread = useLiveQuery<Thread>(`/api/demo/simulator/messages?phone=${encodeURIComponent(persona.phone)}`, ["message.in", "message.out", "demo.reset"]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [unread, setUnread] = useState<ReadonlySet<string>>(new Set());
  const scroller = useRef<HTMLDivElement>(null);

  // Marca con punto verde a los personajes que recibieron un mensaje mientras se veía otro chat.
  useLiveEvents((event) => {
    const phone = event.payload.phone;
    const target = personas.find((p) => p.phone === phone);
    if (target && target.key !== active) setUnread((prev) => new Set([...prev, target.key]));
  }, ["message.out"]);

  // Siempre mostrar el último mensaje (al llegar uno nuevo o al cambiar de teléfono).
  const lastId = thread.data?.messages.at(-1)?.id;
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lastId, persona.phone]);

  const send = async (body: string) => {
    if (!body.trim()) return;
    setSending(true);
    setText("");
    try {
      await sendJson("/api/demo/simulator/send", "POST", { phone: persona.phone, text: body, profileName: persona.name });
    } finally {
      setSending(false);
    }
  };

  const select = (key: string) => {
    onActiveChange(key);
    setUnread((prev) => new Set([...prev].filter((k) => k !== key)));
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1" role="tablist" aria-label="Teléfono de">
        {personas.map((p) => (
          <button
            key={p.key}
            type="button"
            role="tab"
            aria-selected={p.key === persona.key}
            onClick={() => select(p.key)}
            className={cx(
              "relative rounded-full px-3 py-1 text-xs font-medium ring-1",
              p.key === persona.key ? "bg-emerald-700 text-white ring-emerald-700" : "bg-white text-stone-700 ring-stone-300 hover:bg-stone-50",
            )}
          >
            {p.name.split(" ")[0]}
            {unread.has(p.key) && p.key !== persona.key && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white" />}
          </button>
        ))}
      </div>

      <div className="mx-auto flex h-[640px] w-full max-w-[360px] flex-col overflow-hidden rounded-[2.2rem] border-[10px] border-stone-900 bg-[#efeae2] shadow-2xl">
        <div className="flex items-center gap-2 bg-[#075e54] px-3 py-2.5 text-white">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-sm" aria-hidden>
            💈
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{salonName}</p>
            <p className="text-[11px] text-white/80">{sending ? "escribiendo…" : `Teléfono de ${persona.name}`}</p>
          </div>
        </div>
        <div ref={scroller} className="flex flex-1 flex-col gap-1.5 overflow-y-auto px-2.5 py-3" aria-live="polite">
          {(thread.data?.messages ?? []).map((m) => (
            <div key={m.id} className={cx("flex", m.direction === "in" ? "justify-end" : "justify-start")}>
              <div
                className={cx(
                  "max-w-[85%] whitespace-pre-line rounded-lg px-2.5 py-1.5 text-[13px] leading-snug text-stone-900 shadow-sm",
                  m.direction === "in" ? "rounded-tr-none bg-[#d9fdd3]" : "rounded-tl-none bg-white",
                )}
              >
                <Rich text={m.text} />
                <span className="ml-2 float-right mt-1 text-[10px] text-stone-500">{labelAt(m.at, timezone)}</span>
              </div>
            </div>
          ))}
          {sending && (
            <div className="flex justify-start">
              <span className="rounded-lg bg-white px-3 py-1.5 text-stone-400 shadow-sm">•••</span>
            </div>
          )}
        </div>
        <div className="flex gap-1 overflow-x-auto bg-[#efeae2] px-2 pb-1">
          {QUICK.map((q) => (
            <button key={q} type="button" onClick={() => send(q)} className="shrink-0 rounded-full bg-white px-2.5 py-1 text-xs text-emerald-800 shadow-sm hover:bg-emerald-50" disabled={sending}>
              {q}
            </button>
          ))}
        </div>
        <form
          className="flex items-center gap-1.5 bg-[#efeae2] px-2 pb-3 pt-1"
          onSubmit={(e) => {
            e.preventDefault();
            void send(text);
          }}
        >
          <input
            className="flex-1 rounded-full bg-white px-3 py-2 text-sm outline-none"
            placeholder="Escribe como el cliente…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-label={`Mensaje de ${persona.name}`}
          />
          <button type="submit" className="flex h-9 w-9 items-center justify-center rounded-full bg-[#00a884] text-white" aria-label="Enviar" disabled={sending}>
            ➤
          </button>
        </form>
      </div>
    </div>
  );
}
