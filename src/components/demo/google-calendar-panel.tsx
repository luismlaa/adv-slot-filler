"use client";

import { useState } from "react";
import { sendJson, useLiveQuery } from "@/components/live/live-provider";
import { Button, cx, inputClass } from "@/components/ui/primitives";
import type { ExternalEvent } from "@/ports/calendar";
import { labelAt, shortDate } from "@/lib/client-format";

interface CalendarDay {
  date: string;
  calendarId: string;
  events: ExternalEvent[];
}

/** Lo que Carlos ve en SU Google Calendar (simulado): sus citas de Slot Filler y sus cosas personales. */
export function GoogleCalendarPanel({ date, timezone }: { date: string; timezone: string }) {
  const { data } = useLiveQuery<CalendarDay>(`/api/demo/calendar?date=${date}`, ["calendar.synced", "appointment.booked", "appointment.cancelled", "demo.reset", "block.changed"]);
  const [title, setTitle] = useState("Recoger a mi hija");
  const [time, setTime] = useState("15:00");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  /** Hora local del salón → ISO (Santo Domingo no tiene horario de verano, pero se calcula igual). */
  const toIso = (hhmm: string, minutesToAdd = 0) => {
    const guess = new Date(`${date}T${hhmm}:00Z`);
    const local = new Date(guess.toLocaleString("en-US", { timeZone: timezone }));
    const utc = new Date(guess.toLocaleString("en-US", { timeZone: "UTC" }));
    return new Date(guess.getTime() + (utc.getTime() - local.getTime()) + minutesToAdd * 60_000).toISOString();
  };

  const add = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await sendJson("/api/demo/calendar", "POST", { title, start: toIso(time), end: toIso(time, 60) });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo agregar");
    } finally {
      setBusy(false);
    }
  };
  const remove = (eventId: string) => sendJson("/api/demo/calendar", "DELETE", { eventId }).catch(() => undefined);

  return (
    <section aria-label="Google Calendar de Carlos" className="rounded-xl border border-stone-200 bg-white p-3 shadow-sm">
      <div className="mb-2 flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded bg-sky-600 text-[11px] font-bold text-white" aria-hidden>31</span>
        <div>
          <h3 className="text-sm font-semibold text-stone-900">Google Calendar de Carlos</h3>
          <p className="text-[11px] text-stone-500">{data?.calendarId} · {shortDate(date)}</p>
        </div>
      </div>
      <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto">
        {(data?.events ?? []).length === 0 && <li className="text-xs text-stone-400">Sin eventos este día.</li>}
        {(data?.events ?? []).map((e) => (
          <li key={e.id} className={cx("flex items-center justify-between gap-2 rounded-md px-2 py-1 text-xs", e.slotFillerId ? "bg-sky-50 text-sky-900" : "bg-amber-50 text-amber-900")}>
            <span>
              <span className="tabular-nums">{labelAt(e.start, timezone)}</span> · {e.title}
            </span>
            {!e.slotFillerId && (
              <button type="button" className="text-[11px] underline" onClick={() => remove(e.id)}>
                borrar
              </button>
            )}
          </li>
        ))}
      </ul>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <input className={`${inputClass} w-36 py-1 text-xs`} value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Evento personal" />
        <input type="time" className={`${inputClass} w-24 py-1 text-xs`} value={time} onChange={(e) => setTime(e.target.value)} step={900} aria-label="Hora" />
        <Button variant="secondary" className="px-2 py-1 text-xs" onClick={add} disabled={busy}>
          + Evento personal
        </Button>
      </div>
      {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
    </section>
  );
}
