"use client";

import { useLiveQuery } from "@/components/live/live-provider";
import { cx } from "@/components/ui/primitives";
import { labelAt } from "@/lib/client-format";
import type { Activity } from "@/domain/model";

const DOT: Record<Activity["severity"], string> = {
  info: "bg-stone-400",
  success: "bg-emerald-500",
  warning: "bg-amber-500",
};

/** Lo que el sistema va haciendo solo: cada decisión, con su porqué. */
export function ActivityFeed({ timezone, limit = 25 }: { timezone: string; limit?: number }) {
  const { data } = useLiveQuery<Activity[]>(`/api/activity?limit=${limit}`, ["activity", "demo.reset"]);
  return (
    <section aria-label="Actividad en vivo" className="flex flex-col gap-2">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-stone-500">Actividad en vivo</h2>
      {(data ?? []).length === 0 && <p className="text-sm text-stone-400">Aún no hay movimientos.</p>}
      <ol className="flex flex-col gap-2">
        {(data ?? []).map((a) => (
          <li key={a.id} className="flex gap-2 text-sm leading-snug">
            <span className={cx("mt-1.5 h-2 w-2 shrink-0 rounded-full", DOT[a.severity])} aria-hidden />
            <div>
              <p className="text-stone-800">{a.message}</p>
              <p className="text-xs tabular-nums text-stone-400">{labelAt(a.at, timezone)}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
