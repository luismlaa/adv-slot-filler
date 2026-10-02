"use client";

import { useState } from "react";
import { useLiveQuery } from "@/components/live/live-provider";
import { Button, Card, ErrorNote, Spinner, cx } from "@/components/ui/primitives";
import { formatMoney, percent, shortDate } from "@/lib/client-format";
import type { MetricsView } from "@/services/views/metrics";

/** Colores por entidad (validados: aqua/violeta, ΔE CVD 31). Iguales que las insignias del tablero. */
const SERIES = {
  recovered: { label: "Huecos rellenados", color: "#1baf7a" },
  reactivated: { label: "Clientes que volvieron por su ciclo", color: "#4a3aa7" },
} as const;

function Stat({ label, value, hint, accent }: { label: string; value: string; hint?: string; accent?: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs text-stone-500">{label}</p>
      <p className={cx("mt-1 text-2xl font-semibold tabular-nums text-stone-900", accent)}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-stone-500">{hint}</p>}
    </Card>
  );
}

function Legend() {
  return (
    <ul className="flex flex-wrap gap-4 text-xs text-stone-600">
      {Object.values(SERIES).map((s) => (
        <li key={s.label} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: s.color }} aria-hidden />
          {s.label}
        </li>
      ))}
    </ul>
  );
}

/** Barras apiladas por semana: dinero que Slot Filler devolvió al salón. */
function WeeklyChart({ data }: { data: MetricsView }) {
  const [hover, setHover] = useState<number>();
  const weeks = data.weekly;
  const max = Math.max(1, ...weeks.map((w) => w.recovered + w.reactivated));
  const height = 180;
  const scale = (v: number) => (v / max) * height;
  const ticks = [0, 0.5, 1].map((f) => Math.round(max * f));
  return (
    <div className="relative">
      <div className="flex gap-2 pl-14" style={{ height: height + 24 }}>
        <div className="pointer-events-none absolute inset-x-0 top-0" style={{ height }} aria-hidden>
          {ticks.map((t) => (
            <div key={t} className="absolute inset-x-0 flex items-center gap-2" style={{ bottom: scale(t) - 6 }}>
              <span className="w-12 text-right text-[11px] tabular-nums text-stone-400">{formatMoney(t, data.currency)}</span>
              <span className="h-px flex-1 bg-stone-100" />
            </div>
          ))}
        </div>
        {weeks.map((w, i) => {
          const total = w.recovered + w.reactivated;
          return (
            <div
              key={w.weekStart}
              className="relative flex flex-1 flex-col items-center"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(undefined)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(undefined)}
              tabIndex={0}
              aria-label={`Semana del ${shortDate(w.weekStart)}: ${formatMoney(w.recovered, data.currency)} por huecos, ${formatMoney(w.reactivated, data.currency)} por ciclo`}
            >
              <div className="flex w-full max-w-12 flex-col-reverse gap-[2px]" style={{ height, justifyContent: "flex-start" }}>
                {w.recovered > 0 && <div className={cx("w-full", w.reactivated > 0 ? "" : "rounded-t")} style={{ height: scale(w.recovered), backgroundColor: SERIES.recovered.color }} />}
                {w.reactivated > 0 && <div className="w-full rounded-t" style={{ height: scale(w.reactivated), backgroundColor: SERIES.reactivated.color }} />}
              </div>
              <span className="mt-1 text-[11px] text-stone-500">{shortDate(w.weekStart).slice(4)}</span>
              {hover === i && (
                <div className="absolute bottom-full z-10 mb-1 w-48 rounded-lg border border-stone-200 bg-white p-2 text-xs shadow-lg" role="tooltip">
                  <p className="font-medium text-stone-900">Semana del {shortDate(w.weekStart)}</p>
                  <p className="text-stone-600">Huecos: {formatMoney(w.recovered, data.currency)}</p>
                  <p className="text-stone-600">Ciclo: {formatMoney(w.reactivated, data.currency)}</p>
                  <p className="mt-1 font-medium text-stone-900">Total: {formatMoney(total, data.currency)}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function OccupancyBars({ data }: { data: MetricsView }) {
  const rows = [...data.occupancyByStaff].sort((a, b) => b.occupancy - a.occupancy);
  return (
    <ul className="flex flex-col gap-2.5">
      {rows.map((o) => (
        <li key={o.staffId} className="grid grid-cols-[8rem_1fr_3rem] items-center gap-2 text-sm">
          <span className="truncate text-stone-700">{data.staffNames[o.staffId]}</span>
          <span className="h-2 overflow-hidden rounded-full bg-stone-100" aria-hidden>
            <span className="block h-full rounded-full bg-teal-700" style={{ width: percent(o.occupancy) }} />
          </span>
          <span className="text-right tabular-nums text-stone-900">{percent(o.occupancy)}</span>
        </li>
      ))}
    </ul>
  );
}

export function MetricsPanel() {
  const { data, error } = useLiveQuery<MetricsView>("/api/metrics", ["gap.filled", "appointment.booked", "nudge.sent", "demo.reset", "clock.changed"]);
  const [showTable, setShowTable] = useState(false);
  if (error) return <ErrorNote message={error} />;
  if (!data) return <Spinner label="Calculando retorno…" />;
  const money = (n: number) => formatMoney(n, data.currency);
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-stone-900">Lo que Slot Filler le devolvió al salón</h1>
        <p className="text-sm text-stone-600">
          Del {shortDate(data.from)} al {shortDate(data.to)}. Solo cuenta ingresos que no existirían sin el sistema: huecos rellenados tras una cancelación y clientes que volvieron por su invitación de ciclo.
        </p>
      </div>

      <Card className="flex flex-col gap-1 bg-gradient-to-br from-teal-700 to-teal-900 p-6 text-white">
        <p className="text-sm text-teal-100">Ingresos recuperados en 30 días</p>
        <p className="text-4xl font-bold tabular-nums">{money(data.totalRecovered)}</p>
        <p className="text-sm text-teal-100">
          {money(data.revenueRecovered)} por huecos rellenados · {money(data.revenueReactivated)} por clientes que volvieron a tiempo
        </p>
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Huecos rellenados" value={`${data.gapsFilled} de ${data.gapsCreated}`} hint={`${percent(data.fillRate)} de las cancelaciones`} />
        <Stat label="Tiempo medio para rellenar" value={data.avgMinutesToFill === null ? "—" : `${data.avgMinutesToFill} min`} hint="desde que se cancela hasta que otro acepta" />
        <Stat label="Invitaciones de ciclo" value={`${data.nudgesBooked} de ${data.nudgesSent}`} hint={`${percent(data.reactivationRate)} terminaron en cita`} />
        <Stat label="Ocupación de sillas" value={percent(data.occupancy)} hint={`${data.appointments} citas · ${money(data.revenue)} facturado`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card className="p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-stone-900">Recuperado por semana</h2>
            <Button variant="ghost" onClick={() => setShowTable((v) => !v)}>
              {showTable ? "Ver gráfico" : "Ver tabla"}
            </Button>
          </div>
          {showTable ? (
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-stone-500">
                <tr>
                  <th className="py-1 font-medium">Semana</th>
                  <th className="py-1 text-right font-medium">Huecos</th>
                  <th className="py-1 text-right font-medium">Ciclo</th>
                  <th className="py-1 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {data.weekly.map((w) => (
                  <tr key={w.weekStart} className="border-t border-stone-100 tabular-nums">
                    <td className="py-1.5">{shortDate(w.weekStart)}</td>
                    <td className="py-1.5 text-right">{money(w.recovered)}</td>
                    <td className="py-1.5 text-right">{money(w.reactivated)}</td>
                    <td className="py-1.5 text-right font-medium">{money(w.recovered + w.reactivated)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <>
              <WeeklyChart data={data} />
              <div className="mt-3">
                <Legend />
              </div>
            </>
          )}
        </Card>
        <Card className="p-4">
          <h2 className="mb-3 text-base font-semibold text-stone-900">Ocupación por estilista</h2>
          <OccupancyBars data={data} />
          <p className="mt-3 text-xs text-stone-500">Minutos reservados sobre minutos de horario en el periodo.</p>
        </Card>
      </div>
    </div>
  );
}
