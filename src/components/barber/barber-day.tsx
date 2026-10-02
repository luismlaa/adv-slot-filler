"use client";

import { useState } from "react";
import { LiveProvider, sendJson, useLiveQuery } from "@/components/live/live-provider";
import { Badge, Button, Card, ErrorNote, Field, Spinner, cx, inputClass } from "@/components/ui/primitives";
import type { CalendarLink } from "@/domain/model";
import { addDays, firstName, formatMoney, labelAt, shortDate } from "@/lib/client-format";
import type { BoardView } from "@/services/views/board";

const EVENTS = ["appointment.booked", "appointment.cancelled", "appointment.updated", "gap.opened", "gap.filled", "block.changed", "calendar.synced", "demo.reset", "clock.changed"] as const;

type Item =
  | { kind: "appointment"; start: string; end: string; data: BoardView["appointments"][number] }
  | { kind: "block"; start: string; end: string; data: BoardView["blocks"][number] }
  | { kind: "free"; start: string; end: string }
  | { kind: "gap"; start: string; end: string; data: BoardView["gaps"][number] };

function BlockForm({ staffId, view, onDone }: { staffId: string; view: BoardView; onDone: () => void }) {
  const free = view.freeSlots.filter((f) => f.staffId === staffId);
  const [slotStart, setSlotStart] = useState(free[0]?.start ?? "");
  const [minutes, setMinutes] = useState(60);
  const [title, setTitle] = useState("Diligencia personal");
  const [error, setError] = useState<string>();
  const slot = free.find((f) => f.start === slotStart);
  const maxMinutes = slot ? (Date.parse(slot.end) - Date.parse(slot.start)) / 60_000 : 0;
  const submit = async () => {
    setError(undefined);
    try {
      await sendJson("/api/blocks", "POST", { staffId, start: slotStart, end: new Date(Date.parse(slotStart) + Math.min(minutes, maxMinutes) * 60_000).toISOString(), title });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo bloquear");
    }
  };
  if (free.length === 0) return <p className="text-sm text-stone-500">No tienes espacios libres que bloquear este día.</p>;
  return (
    <div className="flex flex-col gap-3">
      <Field label="Desde">
        <select className={inputClass} value={slotStart} onChange={(e) => setSlotStart(e.target.value)}>
          {free.map((f) => (
            <option key={f.start} value={f.start}>
              {labelAt(f.start, view.salon.timezone)} (libre hasta {labelAt(f.end, view.salon.timezone)})
            </option>
          ))}
        </select>
      </Field>
      <Field label="Duración">
        <select className={inputClass} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
          {[30, 60, 90, 120].filter((m) => m <= maxMinutes || m === 30).map((m) => (
            <option key={m} value={m}>{m} min</option>
          ))}
        </select>
      </Field>
      <Field label="Motivo">
        <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} />
      </Field>
      {error && <ErrorNote message={error} />}
      <Button onClick={submit}>Bloquear</Button>
    </div>
  );
}

function Day() {
  const settings = useLiveQuery<{ staff: { id: string; name: string; color: string }[]; calendarLinks: Omit<CalendarLink, "refreshToken">[] }>("/api/settings", ["calendar.synced", "demo.reset"]);
  const [staffId, setStaffId] = useState<string>();
  const [date, setDate] = useState<string>();
  const [blocking, setBlocking] = useState(false);
  const board = useLiveQuery<BoardView>(`/api/board${date ? `?date=${date}` : ""}`, EVENTS);
  const view = board.data;
  if (board.error) return <ErrorNote message={board.error} />;
  if (!view || !settings.data) return <Spinner />;

  const me = staffId ?? settings.data.staff[0]?.id ?? "";
  const member = settings.data.staff.find((s) => s.id === me);
  const link = settings.data.calendarLinks.find((l) => l.staffId === me);
  const tz = view.salon.timezone;
  const items: Item[] = [
    ...view.appointments.filter((a) => a.staffId === me).map((a) => ({ kind: "appointment" as const, start: a.start, end: a.end, data: a })),
    ...view.blocks.filter((b) => b.staffId === me).map((b) => ({ kind: "block" as const, start: b.start, end: b.end, data: b })),
    ...view.freeSlots.filter((f) => f.staffId === me).map((f) => ({ kind: "free" as const, start: f.start, end: f.end })),
    ...view.gaps.filter((g) => g.staffId === me && g.status === "open").map((g) => ({ kind: "gap" as const, start: g.start, end: g.end, data: g })),
  ].sort((a, b) => a.start.localeCompare(b.start));
  const appts = items.filter((i): i is Extract<Item, { kind: "appointment" }> => i.kind === "appointment");
  const next = appts.find((a) => a.data.status === "booked" && a.end > view.now);
  const revenue = appts.reduce((s, a) => s + a.data.price, 0);

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-3 p-4">
      <header className="flex items-center justify-between gap-2">
        <select className={`${inputClass} font-semibold`} value={me} onChange={(e) => setStaffId(e.target.value)} aria-label="¿Quién eres?">
          {settings.data.staff.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <div className="flex gap-1">
          <Button variant={date === undefined ? "primary" : "secondary"} onClick={() => setDate(undefined)}>Hoy</Button>
          <Button variant={date !== undefined ? "primary" : "secondary"} onClick={() => setDate(addDays(view.today, 1))}>Mañana</Button>
        </div>
      </header>

      <Card className="p-4" >
        <p className="text-sm capitalize text-stone-500">{shortDate(view.date)}</p>
        <p className="mt-1 text-lg font-semibold text-stone-900">
          {appts.length} citas · {formatMoney(revenue, view.salon.currency)}
        </p>
        <p className="text-sm text-stone-600">{view.freeSlots.filter((f) => f.staffId === me).length} espacios libres</p>
        {next && (
          <div className="mt-3 rounded-lg p-3" style={{ backgroundColor: `${member?.color ?? "#0f766e"}14` }}>
            <p className="text-xs font-medium uppercase tracking-wide text-stone-500">Próximo cliente</p>
            <p className="font-semibold text-stone-900">{next.data.clientName}</p>
            <p className="text-sm text-stone-600">
              {labelAt(next.start, tz)} · {next.data.serviceName}
            </p>
            <a className="mt-1 inline-block text-sm font-medium text-teal-800 underline" href={`tel:${next.data.clientPhone}`}>Llamar</a>
          </div>
        )}
      </Card>

      <ol className="flex flex-col gap-2">
        {items.map((item) => (
          <li key={`${item.kind}-${item.start}`}>
            {item.kind === "appointment" && (
              <Card className={cx("flex items-start gap-3 p-3", item.data.status !== "booked" && "opacity-60")}>
                <span className="w-20 shrink-0 whitespace-nowrap text-sm font-medium tabular-nums text-stone-900">{labelAt(item.start, tz)}</span>
                <div className="min-w-0">
                  <p className="truncate font-medium text-stone-900">{item.data.clientName}</p>
                  <p className="text-sm text-stone-600">{item.data.serviceName}</p>
                  {item.data.source === "gapfill" && <Badge tone="emerald">✨ Hueco rellenado</Badge>}
                  {item.data.source === "reactivation" && <Badge tone="violet">🔁 Volvió por su ciclo</Badge>}
                </div>
              </Card>
            )}
            {item.kind === "free" && (
              <div className="flex items-center gap-3 rounded-xl border border-dashed border-emerald-300 bg-emerald-50/60 p-3 text-sm text-emerald-800">
                <span className="w-20 shrink-0 whitespace-nowrap tabular-nums">{labelAt(item.start, tz)}</span>
                Libre hasta {labelAt(item.end, tz)}
              </div>
            )}
            {item.kind === "block" && (
              <div className="flex items-center gap-3 rounded-xl bg-stone-100 p-3 text-sm text-stone-600">
                <span className="w-20 shrink-0 whitespace-nowrap tabular-nums">{labelAt(item.start, tz)}</span>
                {item.data.title} {item.data.source === "calendar" && "· 📆 tu Google Calendar"}
              </div>
            )}
            {item.kind === "gap" && (
              <div className="flex items-center gap-3 rounded-xl border-2 border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                <span className="w-20 shrink-0 whitespace-nowrap tabular-nums">{labelAt(item.start, tz)}</span>
                ⚡ Cancelaron: ofreciendo a {item.data.pendingOffers.map((o) => firstName(o.clientName)).join(", ") || "clientes"}…
              </div>
            )}
          </li>
        ))}
      </ol>

      <Card className="p-4">
        {blocking ? (
          <BlockForm staffId={me} view={view} onDone={() => setBlocking(false)} />
        ) : (
          <Button variant="secondary" className="w-full" onClick={() => setBlocking(true)}>Bloquear tiempo</Button>
        )}
      </Card>

      <Card className="p-4 text-sm">
        {link ? (
          <p className="text-stone-700">
            📆 Tu Google Calendar está conectado{link.status === "error" ? " — con error de sincronización" : ""}. Tus citas aparecen ahí y tus eventos personales bloquean la agenda.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-stone-700">Conecta tu Google Calendar para ver tus citas ahí y que tus compromisos personales bloqueen la agenda.</p>
            <a className="text-center font-medium text-teal-800 underline" href={`/api/calendar/google/connect?staffId=${me}`}>Conectar Google Calendar</a>
          </div>
        )}
      </Card>
    </div>
  );
}

export function BarberDay() {
  return (
    <LiveProvider>
      <div className="min-h-screen bg-stone-50">
        <Day />
      </div>
    </LiveProvider>
  );
}
