"use client";

import Link from "next/link";
import { useState } from "react";
import { PERSONAS } from "@/adapters/memory/seed/people";
import { AgendaBoard } from "@/components/board/agenda-board";
import { LiveProvider, sendJson, useLiveEvents } from "@/components/live/live-provider";
import { ActivityFeed } from "@/components/shell/activity-feed";
import { useSalonClock } from "@/components/shell/salon-shell";
import { Button, Spinner } from "@/components/ui/primitives";
import { labelAt, localDateIn, shortDate } from "@/lib/client-format";
import { Director, type StepResult } from "./director";
import { GoogleCalendarPanel } from "./google-calendar-panel";
import { type Persona, PhoneSimulator } from "./phone-simulator";

const PERSONA_LIST: readonly Persona[] = [
  ...Object.entries(PERSONAS).map(([key, p]) => ({ key, name: p.name, phone: p.phone })),
  { key: "nuevo", name: "Cliente nuevo", phone: "+18295550199" },
];

const STEPS = [
  { label: "+1 hora", minutes: 60 },
  { label: "+1 día", minutes: 60 * 24 },
  { label: "+1 semana", minutes: 60 * 24 * 7 },
] as const;

function Stage() {
  const clock = useSalonClock();
  const [persona, setPersona] = useState<string>("pedro");
  const [focusDate, setFocusDate] = useState<string>();
  const [boardKey, setBoardKey] = useState(0);
  const [directorKey, setDirectorKey] = useState(0);
  const [busy, setBusy] = useState(false);

  useLiveEvents(() => {
    setFocusDate(undefined);
    setPersona("pedro");
    setDirectorKey((k) => k + 1);
  }, ["demo.reset"]);

  if (!clock) return <Spinner label="Preparando la demo…" />;
  const today = localDateIn(clock.now, clock.timezone);

  const onResult = (result: StepResult) => {
    if (result.persona) setPersona(result.persona);
    if (result.focusDate) {
      setFocusDate(result.focusDate);
      setBoardKey((k) => k + 1);
    }
  };
  const advance = async (minutes: number) => {
    setBusy(true);
    try {
      await sendJson("/api/demo/clock", "POST", { minutes });
      setFocusDate(undefined);
      setBoardKey((k) => k + 1);
    } finally {
      setBusy(false);
    }
  };
  const reset = async () => {
    setBusy(true);
    try {
      await sendJson("/api/demo/reset", "POST");
      setBoardKey((k) => k + 1);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-stone-100">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 bg-white px-4 py-2.5">
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold tracking-tight text-teal-800">◧ Slot Filler</span>
          <span className="text-sm text-stone-500">{clock.salonName}</span>
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">Demo en vivo</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-lg bg-stone-900 px-3 py-1 text-sm font-medium tabular-nums text-white" aria-label="Hora simulada del salón">
            🕐 {shortDate(today)} · {labelAt(clock.now, clock.timezone)}
          </span>
          {STEPS.map((s) => (
            <Button key={s.label} variant="secondary" className="text-xs" onClick={() => advance(s.minutes)} disabled={busy}>
              {s.label}
            </Button>
          ))}
          <Button variant="ghost" className="text-xs" onClick={reset} disabled={busy}>
            ↺ Reiniciar
          </Button>
          <Link href="/agenda" target="_blank" className="text-xs text-stone-500 underline">
            Panel completo ↗
          </Link>
        </div>
      </header>

      <div className="grid flex-1 gap-4 p-4 xl:grid-cols-[19rem_minmax(0,1fr)_23rem]">
        <aside className="flex flex-col gap-3 xl:max-h-[calc(100vh-5rem)] xl:overflow-y-auto">
          <Director key={directorKey} onResult={onResult} />
          <GoogleCalendarPanel date={focusDate ?? today} timezone={clock.timezone} />
          <div className="rounded-xl border border-stone-200 bg-white p-3 shadow-sm">
            <ActivityFeed timezone={clock.timezone} limit={12} />
          </div>
        </aside>
        <main className="min-w-0">
          <AgendaBoard key={boardKey} compact initialDate={focusDate} />
        </main>
        <aside>
          <PhoneSimulator personas={PERSONA_LIST} active={persona} onActiveChange={setPersona} salonName={clock.salonName} timezone={clock.timezone} />
        </aside>
      </div>
    </div>
  );
}

export function DemoStage() {
  return (
    <LiveProvider>
      <Stage />
    </LiveProvider>
  );
}
