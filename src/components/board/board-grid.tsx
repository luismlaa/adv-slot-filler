"use client";

import { cx } from "@/components/ui/primitives";
import { firstName, labelAt, minutesOfDay, percent, relativeMinutes } from "@/lib/client-format";
import { type BoardAppointment, type BoardView, type FreeSlot, PX_PER_MINUTE } from "./types";

const SOURCE_BADGE: Partial<Record<BoardAppointment["source"], { label: string; className: string }>> = {
  gapfill: { label: "✨ Hueco rellenado", className: "bg-emerald-600 text-white" },
  reactivation: { label: "🔁 Volvió por su ciclo", className: "bg-violet-600 text-white" },
  whatsapp: { label: "WhatsApp", className: "bg-white/80 text-stone-700" },
};

interface Props {
  view: BoardView;
  onAppointment: (appointment: BoardAppointment) => void;
  onFreeSlot: (slot: FreeSlot) => void;
  highlightIds?: ReadonlySet<string>;
  /** Columnas más angostas (demo en pantalla dividida). */
  compact?: boolean;
}

/** Tablero por columnas (una por estilista) con huecos libres resaltados y relleno en vivo. */
export function BoardGrid({ view, onAppointment, onFreeSlot, highlightIds, compact = false }: Props) {
  const tz = view.salon.timezone;
  const start = view.dayStartMinutes;
  const height = (view.dayEndMinutes - start) * PX_PER_MINUTE;
  const top = (iso: string) => (minutesOfDay(iso, tz) - start) * PX_PER_MINUTE;
  const span = (a: string, b: string) => Math.max(18, (Date.parse(b) - Date.parse(a)) / 60_000) * PX_PER_MINUTE;
  const hours = Array.from({ length: Math.floor((view.dayEndMinutes - start) / 60) + 1 }, (_, i) => Math.ceil(start / 60) + i).filter((h) => h * 60 <= view.dayEndMinutes);
  const isToday = view.date === view.today;
  /** Tramos fuera del horario del estilista (almuerzo, antes de abrir, después de cerrar). */
  const offHours = (working: BoardView["staff"][number]["working"]) => {
    const ranges = working.map((w) => ({ from: minutesOfDay(w.start, tz), to: minutesOfDay(w.end, tz) })).sort((a, b) => a.from - b.from);
    const out: { from: number; to: number }[] = [];
    let cursor = start;
    for (const r of ranges) {
      if (r.from > cursor) out.push({ from: cursor, to: r.from });
      cursor = Math.max(cursor, r.to);
    }
    if (cursor < view.dayEndMinutes) out.push({ from: cursor, to: view.dayEndMinutes });
    return out;
  };
  const nowTop = isToday ? top(view.now) : -1;

  return (
    <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white shadow-sm">
      <div className="grid min-w-max" style={{ gridTemplateColumns: `3.5rem repeat(${view.staff.length}, minmax(${compact ? "8.5rem" : "11rem"}, 1fr))` }}>
        <div className="sticky left-0 z-20 border-b border-r border-stone-200 bg-white" />
        {view.staff.map((s) => (
          <div key={s.id} className="border-b border-stone-200 px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} aria-hidden />
              <span className="text-sm font-semibold text-stone-900">{s.name}</span>
            </div>
            <div className="mt-1 flex items-center gap-2 text-xs text-stone-500">
              {s.working.length === 0 ? (
                <span>Día libre</span>
              ) : (
                <>
                  <span className="h-1.5 w-16 overflow-hidden rounded-full bg-stone-100" aria-hidden>
                    <span className="block h-full rounded-full bg-teal-600" style={{ width: percent(s.utilization) }} />
                  </span>
                  <span>{percent(s.utilization)} ocupado</span>
                </>
              )}
            </div>
          </div>
        ))}

        <div className="sticky left-0 z-10 border-r border-stone-200 bg-white" style={{ height }}>
          {hours.map((h) => (
            <div key={h} className="absolute -translate-y-2 pl-2 text-[11px] tabular-nums text-stone-400" style={{ top: (h * 60 - start) * PX_PER_MINUTE }}>
              {h % 12 === 0 ? 12 : h % 12}
              {h >= 12 ? "p" : "a"}
            </div>
          ))}
        </div>

        {view.staff.map((s) => (
          <div key={s.id} className="relative border-r border-stone-100 last:border-r-0" style={{ height }}>
            {hours.map((h) => (
              <div key={h} className="absolute inset-x-0 border-t border-stone-100" style={{ top: (h * 60 - start) * PX_PER_MINUTE }} />
            ))}
            {offHours(s.working).map((o) => (
              <div
                key={o.from}
                className="absolute inset-x-0 bg-[repeating-linear-gradient(45deg,#f5f5f4,#f5f5f4_8px,#fafaf9_8px,#fafaf9_16px)]"
                style={{ top: (o.from - start) * PX_PER_MINUTE, height: (o.to - o.from) * PX_PER_MINUTE }}
                aria-hidden
              />
            ))}

            {view.freeSlots
              .filter((f) => f.staffId === s.id)
              .map((f) => (
                <button
                  key={f.start}
                  type="button"
                  onClick={() => onFreeSlot(f)}
                  className="group absolute inset-x-1 rounded-md border border-dashed border-emerald-400 bg-emerald-50/60 text-left text-[11px] text-emerald-800 hover:bg-emerald-100"
                  style={{ top: top(f.start), height: span(f.start, f.end) }}
                  aria-label={`Espacio libre con ${s.name} desde ${labelAt(f.start, tz)}`}
                >
                  <span className="px-1.5 py-0.5 font-medium">Libre · {labelAt(f.start, tz)}</span>
                </button>
              ))}

            {view.blocks
              .filter((b) => b.staffId === s.id)
              .map((b) => (
                <div
                  key={b.id}
                  className="absolute inset-x-1 overflow-hidden rounded-md border border-stone-300 bg-[repeating-linear-gradient(135deg,#e7e5e4,#e7e5e4_6px,#f5f5f4_6px,#f5f5f4_12px)] px-1.5 py-1 text-[11px] text-stone-600"
                  style={{ top: top(b.start), height: span(b.start, b.end) }}
                >
                  <p className="font-medium">{b.title}</p>
                  <p>{b.source === "calendar" ? "📆 Google Calendar" : "Bloqueado"}</p>
                </div>
              ))}

            {view.gaps
              .filter((g) => g.staffId === s.id && g.status === "open")
              .map((g) => (
                <div
                  key={g.id}
                  className="absolute inset-x-1 z-10 animate-pulse overflow-hidden rounded-md border-2 border-amber-400 bg-amber-50 px-1.5 py-1 text-[11px] text-amber-900 shadow"
                  style={{ top: top(g.start), height: span(g.start, g.end) }}
                  role="status"
                >
                  <p className="font-semibold">⚡ Hueco por cancelación</p>
                  <p>
                    {g.wave === 0
                      ? "Preparando ofertas…"
                      : `Ola ${g.wave}: ${g.pendingOffers.map((o) => firstName(o.clientName)).join(", ") || "esperando"}`}
                  </p>
                  {g.pendingOffers[0] && <p className="opacity-80">vence en {relativeMinutes(g.pendingOffers[0].expiresAt, view.now)}</p>}
                </div>
              ))}

            {view.appointments
              .filter((a) => a.staffId === s.id)
              .map((a) => {
                const badge = SOURCE_BADGE[a.source];
                const done = a.status === "completed" || a.status === "no_show";
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => onAppointment(a)}
                    className={cx(
                      "absolute inset-x-1 z-[5] overflow-hidden rounded-md px-1.5 py-1 text-left text-[11px] leading-tight shadow-sm ring-1 transition hover:z-20 hover:shadow-md",
                      done ? "opacity-55" : "",
                      highlightIds?.has(a.id) ? "ring-2 ring-emerald-500 animate-[pulse_1s_ease-in-out_3]" : "ring-black/5",
                    )}
                    style={{ top: top(a.start), height: span(a.start, a.end), backgroundColor: `${s.color}1f`, borderLeft: `3px solid ${s.color}` }}
                  >
                    <p className="truncate font-semibold text-stone-900">{a.clientName}</p>
                    <p className="truncate text-stone-600">
                      {labelAt(a.start, tz)} · {a.serviceName}
                    </p>
                    {badge && a.source !== "whatsapp" && <span className={cx("mt-0.5 inline-block rounded px-1 text-[10px] font-medium", badge.className)}>{badge.label}</span>}
                  </button>
                );
              })}

            {nowTop >= 0 && nowTop <= height && (
              <div className="pointer-events-none absolute inset-x-0 z-30 border-t-2 border-rose-500" style={{ top: nowTop }} aria-hidden>
                <span className="absolute -left-1 -top-1.5 h-3 w-3 rounded-full bg-rose-500" />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
