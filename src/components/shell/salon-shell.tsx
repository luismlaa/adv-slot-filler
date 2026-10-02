"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { LiveProvider, useLiveConnected, useLiveEvents } from "@/components/live/live-provider";
import { cx } from "@/components/ui/primitives";
import { labelAt, localDateIn, shortDate } from "@/lib/client-format";

const NAV = [
  { href: "/agenda", label: "Agenda", icon: "📅" },
  { href: "/por-volver", label: "Por volver", icon: "🔁" },
  { href: "/lista-espera", label: "Lista de espera", icon: "⏳" },
  { href: "/metricas", label: "Métricas", icon: "📈" },
  { href: "/ajustes", label: "Ajustes", icon: "⚙️" },
] as const;

interface ClockInfo {
  now: string;
  timezone: string;
  salonName: string;
  demo: boolean;
}

/** Reloj del salón: se sincroniza con el servidor (reloj simulado en la demo) y avanza localmente. */
export function useSalonClock() {
  const [info, setInfo] = useState<ClockInfo & { receivedAt: number }>();
  const [display, setDisplay] = useState<string>();
  const [version, setVersion] = useState(0);
  useLiveEvents(() => setVersion((v) => v + 1), ["clock.changed", "demo.reset"]);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/clock", { signal: controller.signal, cache: "no-store" })
      .then((r) => r.json())
      .then((data: ClockInfo) => {
        setInfo({ ...data, receivedAt: Date.now() });
        setDisplay(data.now);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [version]);
  useEffect(() => {
    if (!info) return;
    const id = setInterval(() => setDisplay(new Date(Date.parse(info.now) + Date.now() - info.receivedAt).toISOString()), 15_000);
    return () => clearInterval(id);
  }, [info]);
  return info && display ? { ...info, now: display } : undefined;
}

function Header() {
  const clock = useSalonClock();
  const connected = useLiveConnected();
  return (
    <header className="flex items-center justify-between gap-4 border-b border-stone-200 bg-white px-4 py-2.5 md:px-6">
      <div className="flex items-center gap-2">
        <span className="text-lg font-semibold tracking-tight text-stone-900">{clock?.salonName ?? "Slot Filler"}</span>
        {clock?.demo && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">Demo</span>}
      </div>
      <div className="flex items-center gap-3 text-sm text-stone-600">
        {clock && (
          <span className="tabular-nums" title="Hora del salón">
            {shortDate(localDateIn(clock.now, clock.timezone))} · {labelAt(clock.now, clock.timezone)}
          </span>
        )}
        <span className={cx("h-2 w-2 rounded-full", connected ? "bg-emerald-500" : "bg-stone-300")} title={connected ? "En vivo" : "Reconectando…"} />
      </div>
    </header>
  );
}

function Nav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Secciones del salón" className="flex gap-1 overflow-x-auto border-b border-stone-200 bg-white px-2 py-1 md:w-52 md:shrink-0 md:flex-col md:border-b-0 md:border-r md:px-3 md:py-4">
      <Link href="/" className="mb-4 hidden px-2 text-sm font-bold tracking-tight text-teal-800 md:block">
        ◧ Slot Filler
      </Link>
      {NAV.map((item) => {
        const active = pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cx(
              "flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium",
              active ? "bg-teal-50 text-teal-800" : "text-stone-600 hover:bg-stone-100",
            )}
          >
            <span aria-hidden>{item.icon}</span>
            {item.label}
          </Link>
        );
      })}
      <Link href="/barbero" className="mt-auto hidden px-3 py-2 text-xs text-stone-500 hover:text-stone-800 md:block">
        Vista del barbero →
      </Link>
    </nav>
  );
}

export function SalonShell({ children }: { children: ReactNode }) {
  return (
    <LiveProvider>
      <div className="flex min-h-screen flex-col bg-stone-50 md:flex-row">
        <Nav />
        <div className="flex min-w-0 flex-1 flex-col">
          <Header />
          <main className="flex-1 p-4 md:p-6">{children}</main>
        </div>
      </div>
    </LiveProvider>
  );
}
