"use client";

import { useEffect, useRef, useState } from "react";
import { useLiveEvents, useLiveQuery } from "@/components/live/live-provider";
import { ActivityFeed } from "@/components/shell/activity-feed";
import { Badge, Button, Card, ErrorNote, Spinner } from "@/components/ui/primitives";
import type { Service } from "@/domain/model";
import { addDays, shortDate } from "@/lib/client-format";
import { AppointmentDialog } from "./appointment-dialog";
import { BoardGrid } from "./board-grid";
import { BookDialog } from "./book-dialog";
import type { BoardAppointment, BoardView, FreeSlot } from "./types";

const BOARD_EVENTS = [
  "appointment.booked",
  "appointment.cancelled",
  "appointment.updated",
  "gap.opened",
  "gap.filled",
  "gap.expired",
  "offer.sent",
  "offer.accepted",
  "offer.declined",
  "offer.expired",
  "block.changed",
  "calendar.synced",
  "clock.changed",
  "demo.reset",
] as const;

interface Props {
  /** En la demo el tablero va más compacto y sin feed lateral. */
  compact?: boolean;
}

export function AgendaBoard({ compact = false }: Props) {
  const [date, setDate] = useState<string>();
  const board = useLiveQuery<BoardView>(`/api/board${date ? `?date=${date}` : ""}`, BOARD_EVENTS);
  const settings = useLiveQuery<{ services: Service[] }>("/api/settings", ["demo.reset"]);
  const [selected, setSelected] = useState<BoardAppointment>();
  const [slot, setSlot] = useState<FreeSlot>();
  const [fresh, setFresh] = useState<ReadonlySet<string>>(new Set());
  const clearTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Resalta las citas recién creadas (p. ej. un hueco que se acaba de rellenar).
  useLiveEvents((event) => {
    const id = event.payload.appointmentId;
    if (typeof id !== "string") return;
    setFresh((prev) => new Set([...prev, id]));
    clearTimeout(clearTimer.current);
    clearTimer.current = setTimeout(() => setFresh(new Set()), 6000);
  }, ["appointment.booked", "gap.filled"]);

  // Tras un reset/avance de reloj, volver al "hoy" del salón.
  useLiveEvents(() => setDate(undefined), ["demo.reset"]);
  useEffect(() => () => clearTimeout(clearTimer.current), []);

  const view = board.data;
  if (board.error) return <ErrorNote message={board.error} />;
  if (!view) return <Spinner label="Cargando agenda…" />;

  const openGaps = view.gaps.filter((g) => g.status === "open").length;
  const freeCount = view.freeSlots.length;

  return (
    <div className={compact ? "flex flex-col gap-3" : "grid gap-4 xl:grid-cols-[1fr_18rem]"}>
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <Button variant="secondary" onClick={() => setDate(addDays(view.date, -1))} aria-label="Día anterior">
              ←
            </Button>
            <Button variant="secondary" onClick={() => setDate(undefined)} disabled={view.date === view.today}>
              Hoy
            </Button>
            <Button variant="secondary" onClick={() => setDate(addDays(view.date, 1))} aria-label="Día siguiente">
              →
            </Button>
            <h1 className="ml-2 text-lg font-semibold capitalize text-stone-900">{shortDate(view.date)}</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge tone="emerald">{freeCount} espacios libres</Badge>
            {openGaps > 0 && <Badge tone="amber">⚡ {openGaps} hueco(s) rellenándose</Badge>}
            <Badge tone="violet">🔁 ciclo</Badge>
            <Badge tone="emerald">✨ hueco rellenado</Badge>
          </div>
        </div>
        <BoardGrid view={view} onAppointment={setSelected} onFreeSlot={setSlot} highlightIds={fresh} />
      </div>
      {!compact && (
        <Card className="h-fit p-4 xl:sticky xl:top-4">
          <ActivityFeed timezone={view.salon.timezone} />
        </Card>
      )}
      <AppointmentDialog
        appointment={selected}
        staffName={view.staff.find((s) => s.id === selected?.staffId)?.name ?? ""}
        timezone={view.salon.timezone}
        currency={view.salon.currency}
        onClose={() => setSelected(undefined)}
      />
      {slot && (
        <BookDialog
          key={`${slot.staffId}|${slot.start}`}
          slot={slot}
          staff={view.staff}
          services={settings.data?.services ?? []}
          timezone={view.salon.timezone}
          onClose={() => setSlot(undefined)}
        />
      )}
    </div>
  );
}
