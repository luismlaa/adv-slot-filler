"use client";

import { useEffect, useState } from "react";
import { useLiveEvents } from "@/components/live/live-provider";

export interface ClockInfo {
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

