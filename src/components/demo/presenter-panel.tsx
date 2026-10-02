"use client";

import { useEffect, useState } from "react";
import { sendJson } from "@/components/live/live-provider";
import { useSalonClock } from "@/components/shell/use-salon-clock";
import { Button, cx, inputClass } from "@/components/ui/primitives";
import { labelAt, localDateIn, shortDate } from "@/lib/client-format";
import { CHAT_CONTACTS } from "@/lib/demo-contacts";
import { GoogleCalendarPanel } from "./google-calendar-panel";

const JUMPS = [
  { label: "+1 hora", minutes: 60 },
  { label: "+1 día", minutes: 60 * 24 },
  { label: "+1 semana", minutes: 60 * 24 * 7 },
  { label: "+4 semanas", minutes: 60 * 24 * 28 },
] as const;

/** Instante ISO de una fecha y hora locales del salón (sin depender de la zona del navegador). */
function zonedIso(date: string, time: string, timezone: string): string {
  const guess = new Date(`${date}T${time}:00Z`);
  const local = new Date(guess.toLocaleString("en-US", { timeZone: timezone }));
  const utc = new Date(guess.toLocaleString("en-US", { timeZone: "UTC" }));
  return new Date(guess.getTime() + (utc.getTime() - local.getTime())).toISOString();
}

/**
 * Controles del presentador (solo demo). No forman parte del producto: viven ocultos tras un punto
 * en la esquina o la tecla «.», para que la pantalla se vea exactamente como la verá el salón.
 */
export function PresenterPanel() {
  const clock = useSalonClock();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [target, setTarget] = useState({ date: "", time: "10:05" });
  const [cycleOf, setCycleOf] = useState<string>(CHAT_CONTACTS[0]!.phone);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el?.closest("input, textarea, select, [contenteditable=true]")) return;
      if (e.key === ".") setOpen((v) => !v);
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!clock?.demo) return null;
  const today = localDateIn(clock.now, clock.timezone);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(undefined);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo completar");
    } finally {
      setBusy(false);
    }
  };
  const advance = (minutes: number) => run(() => sendJson("/api/demo/clock", "POST", { minutes }));
  const jumpTo = () => {
    const minutes = Math.round((Date.parse(zonedIso(target.date || today, target.time, clock.timezone)) - Date.parse(clock.now)) / 60_000);
    if (minutes <= 0) {
      setError("Solo se puede avanzar hacia el futuro");
      return;
    }
    void advance(minutes);
  };

  return (
    <>
      <button
        type="button"
        aria-label="Controles del presentador"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cx("fixed bottom-3 right-3 z-40 size-3 rounded-full transition", open ? "bg-teal-600" : "bg-stone-300/60 hover:bg-stone-400")}
      />
      {open && (
        <aside
          aria-label="Presentador"
          className="fixed bottom-8 right-3 z-40 flex max-h-[calc(100vh-3rem)] w-[22rem] max-w-[calc(100vw-1.5rem)] flex-col gap-3 overflow-y-auto rounded-xl border border-stone-200 bg-white p-4 shadow-2xl"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-stone-900">Presentador</h2>
            <span className="text-xs text-stone-500">tecla «.» para ocultar</span>
          </div>

          <a href="/chat" target="_blank" rel="noreferrer" className="rounded-lg bg-[#00a884] px-3 py-2 text-center text-sm font-medium text-white hover:bg-[#008f6f]">
            Abrir WhatsApp del cliente ↗
          </a>

          <section className="flex flex-col gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-stone-500">
              Reloj del salón · <span className="normal-case tabular-nums text-stone-800">{shortDate(today)} · {labelAt(clock.now, clock.timezone)}</span>
            </p>
            <div className="flex flex-wrap gap-1.5">
              {JUMPS.map((j) => (
                <Button key={j.label} variant="secondary" className="px-2 py-1 text-xs" disabled={busy} onClick={() => void advance(j.minutes)}>
                  {j.label}
                </Button>
              ))}
            </div>
            <div className="flex items-center gap-1.5">
              <input type="date" className={`${inputClass} py-1 text-xs`} value={target.date || today} min={today} onChange={(e) => setTarget((t) => ({ ...t, date: e.target.value }))} aria-label="Saltar a fecha" />
              <input type="time" className={`${inputClass} w-24 py-1 text-xs`} value={target.time} onChange={(e) => setTarget((t) => ({ ...t, time: e.target.value }))} aria-label="Saltar a hora" />
              <Button variant="secondary" className="px-2 py-1 text-xs" disabled={busy} onClick={jumpTo}>
                Ir
              </Button>
            </div>
            <div className="flex items-center gap-1.5">
              <label className="text-xs text-stone-600" htmlFor="cycle-of">
                Hasta que le toque volver a
              </label>
              <select id="cycle-of" className={`${inputClass} flex-1 py-1 text-xs`} value={cycleOf} onChange={(e) => setCycleOf(e.target.value)}>
                {CHAT_CONTACTS.filter((c) => c.key !== "nuevo").map((c) => (
                  <option key={c.phone} value={c.phone}>
                    {c.name}
                  </option>
                ))}
              </select>
              <Button variant="secondary" className="px-2 py-1 text-xs" disabled={busy} onClick={() => void run(() => sendJson("/api/demo/clock", "POST", { untilCycleOf: cycleOf }))}>
                Ir
              </Button>
            </div>
            <p className="text-[11px] leading-snug text-stone-500">Al avanzar corren los mismos jobs que en producción: se cierran citas, vencen ofertas y salen las invitaciones de ciclo (10:00 a. m.).</p>
          </section>

          <GoogleCalendarPanel date={today} timezone={clock.timezone} />

          <Button variant="ghost" className="text-xs" disabled={busy} onClick={() => void run(() => sendJson("/api/demo/reset", "POST"))}>
            ↺ Reiniciar la demo
          </Button>
          {error && <p className="text-xs text-rose-600">{error}</p>}
        </aside>
      )}
    </>
  );
}
