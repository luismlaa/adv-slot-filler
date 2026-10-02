"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { DomainEvent, DomainEventType } from "@/ports/runtime";
import { connectSupabaseRealtime } from "./supabase-transport";

type Listener = (event: DomainEvent) => void;

interface LiveContextValue {
  subscribe(listener: Listener): () => void;
  connected: boolean;
}

const LiveContext = createContext<LiveContextValue | null>(null);

/** Una sola conexión SSE por pestaña; todos los paneles se suscriben a ella. */
export function LiveProvider({ children }: { children: ReactNode }) {
  const listeners = useRef(new Set<Listener>());
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const emit = (event: DomainEvent) => {
      for (const listener of listeners.current) listener(event);
    };
    // Producción (varias instancias): Supabase Realtime. Demo / un solo proceso: SSE del bus en memoria.
    if (process.env.NEXT_PUBLIC_LIVE_TRANSPORT === "supabase") return connectSupabaseRealtime(emit, setConnected);
    const source = new EventSource("/api/events");
    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false);
    source.onmessage = (message) => {
      try {
        emit(JSON.parse(message.data) as DomainEvent);
      } catch {
        // mensaje no JSON (heartbeat): se ignora
      }
    };
    return () => source.close();
  }, []);

  const subscribe = useCallback((listener: Listener) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);

  return <LiveContext.Provider value={{ subscribe, connected }}>{children}</LiveContext.Provider>;
}

export function useLiveEvents(listener: Listener, types?: readonly DomainEventType[]) {
  const ctx = useContext(LiveContext);
  const latest = useRef(listener);
  useEffect(() => {
    latest.current = listener;
  });
  const key = types?.join(",") ?? "*";
  useEffect(() => {
    if (!ctx) return;
    const allowed = key === "*" ? undefined : new Set(key.split(","));
    return ctx.subscribe((event) => {
      if (!allowed || allowed.has(event.type)) latest.current(event);
    });
  }, [ctx, key]);
}

export function useLiveConnected() {
  return useContext(LiveContext)?.connected ?? false;
}

export interface LiveQuery<T> {
  data: T | undefined;
  error: string | undefined;
  loading: boolean;
  reload: () => void;
}

/** GET JSON que se vuelve a pedir solo cuando llega un evento relevante (con debounce). */
export function useLiveQuery<T>(url: string | null, types?: readonly DomainEventType[]): LiveQuery<T> {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (url === null) return;
    const controller = new AbortController();
    fetch(url, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? `Error ${response.status}`);
        setData(body as T);
        setError(undefined);
      })
      .catch((e: unknown) => {
        if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Error de red");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [url, version]);

  const reload = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setVersion((v) => v + 1), 120);
  }, []);

  useLiveEvents(reload, types);
  return { data, error, loading, reload };
}

/** POST/PUT/DELETE JSON con manejo de error uniforme. */
export async function sendJson<T>(url: string, method: "POST" | "PUT" | "DELETE", body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((payload as { error?: string }).error ?? `Error ${response.status}`);
  return payload as T;
}
