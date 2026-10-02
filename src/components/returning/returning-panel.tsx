"use client";

import { useState } from "react";
import { sendJson, useLiveQuery } from "@/components/live/live-provider";
import { Badge, Button, Card, ErrorNote, Spinner, cx } from "@/components/ui/primitives";
import type { CycleStatus } from "@/domain/cycles";
import { shortDate } from "@/lib/client-format";
import type { ReturningRow, ReturningView } from "@/services/views/returning";

const STATUS: Record<CycleStatus, { label: string; tone: "amber" | "rose" | "teal" | "neutral" | "violet" }> = {
  due: { label: "Le toca", tone: "teal" },
  overdue: { label: "Atrasado", tone: "amber" },
  at_risk: { label: "En riesgo", tone: "rose" },
  ok: { label: "Al día", tone: "neutral" },
  booked: { label: "Con cita", tone: "violet" },
};

const NUDGE: Record<NonNullable<ReturningRow["nudge"]>["status"], string> = {
  sent: "Invitado · esperando",
  booked: "✅ Reservó",
  declined: "Dijo que no",
  ignored: "Sin respuesta",
};

function dueLabel(row: ReturningRow): string {
  if (row.daysUntilDue > 0) return `en ${row.daysUntilDue} d`;
  if (row.daysUntilDue === 0) return "hoy";
  return `hace ${-row.daysUntilDue} d`;
}

function Row({ row }: { row: ReturningRow }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const invite = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await sendJson(`/api/returning/${row.clientId}/invite`, "POST");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo invitar");
    } finally {
      setBusy(false);
    }
  };
  const status = STATUS[row.status];
  return (
    <tr className="border-t border-stone-100 align-top">
      <td className="px-3 py-2.5">
        <p className="font-medium text-stone-900">{row.clientName}</p>
        <p className="text-xs tabular-nums text-stone-500">{row.phone}</p>
      </td>
      <td className="px-3 py-2.5">
        <p>{row.serviceName}</p>
        <p className="text-xs text-stone-500">con {row.staffName}</p>
      </td>
      <td className="px-3 py-2.5">
        <p className="tabular-nums">cada {row.expectedDays} días</p>
        <div className="mt-1 flex items-center gap-1.5" title={`Confianza del patrón: ${Math.round(row.confidence * 100)}% (${row.visits} visitas)`}>
          <span className="h-1.5 w-14 overflow-hidden rounded-full bg-stone-100">
            <span className="block h-full rounded-full bg-teal-600" style={{ width: `${Math.round(row.confidence * 100)}%` }} />
          </span>
          <span className="text-xs text-stone-500">{row.visits} visitas</span>
        </div>
      </td>
      <td className="px-3 py-2.5 tabular-nums">
        <p>{shortDate(row.lastVisitDate)}</p>
        <p className="text-xs text-stone-500">hace {row.daysSinceLast} d</p>
      </td>
      <td className="px-3 py-2.5 tabular-nums">
        <p>{shortDate(row.dueDate)}</p>
        <p className="text-xs text-stone-500">{dueLabel(row)}</p>
      </td>
      <td className="px-3 py-2.5">
        <Badge tone={status.tone}>{status.label}</Badge>
      </td>
      <td className="px-3 py-2.5 text-right">
        {row.optedOut ? (
          <span className="text-xs text-stone-400">Pidió no recibir avisos</span>
        ) : row.nudge ? (
          <span className={cx("text-xs", row.nudge.status === "booked" ? "font-medium text-emerald-700" : "text-stone-500")}>{NUDGE[row.nudge.status]}</span>
        ) : (
          <Button variant="secondary" onClick={invite} disabled={busy}>
            {busy ? "Enviando…" : "Invitar ahora"}
          </Button>
        )}
        {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
      </td>
    </tr>
  );
}

function Table({ rows, empty }: { rows: readonly ReturningRow[]; empty: string }) {
  if (rows.length === 0) return <p className="p-4 text-sm text-stone-500">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[52rem] text-left text-sm">
        <thead className="text-xs uppercase tracking-wide text-stone-500">
          <tr>
            <th className="px-3 py-2 font-medium">Cliente</th>
            <th className="px-3 py-2 font-medium">Servicio habitual</th>
            <th className="px-3 py-2 font-medium">Su ciclo real</th>
            <th className="px-3 py-2 font-medium">Última visita</th>
            <th className="px-3 py-2 font-medium">Le toca</th>
            <th className="px-3 py-2 font-medium">Estado</th>
            <th className="px-3 py-2 text-right font-medium">Invitación</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <Row key={`${r.clientId}-${r.category}`} row={r} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Panel "clientes por volver esta semana" según el patrón real de cada uno. */
export function ReturningPanel() {
  const { data, error } = useLiveQuery<ReturningView>("/api/returning", ["nudge.sent", "appointment.booked", "appointment.updated", "demo.reset", "clock.changed"]);
  if (error) return <ErrorNote message={error} />;
  if (!data) return <Spinner label="Calculando ciclos…" />;
  const invited = data.rows.filter((r) => r.nudge).length;
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-stone-900">Clientes por volver esta semana</h1>
        <p className="text-sm text-stone-600">
          Semana del {shortDate(data.weekStart)} al {shortDate(data.weekEnd)}. Cada fecha sale del ciclo real del cliente, no de un recordatorio genérico.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: "Por volver esta semana", value: data.rows.length, tone: "text-teal-800" },
          { label: "Ya invitados", value: invited, tone: "text-stone-900" },
          { label: "Con cita futura", value: data.counts.booked, tone: "text-violet-700" },
          { label: "En riesgo de perderse", value: data.counts.at_risk, tone: "text-rose-700" },
        ].map((k) => (
          <Card key={k.label} className="p-4">
            <p className="text-xs text-stone-500">{k.label}</p>
            <p className={cx("mt-1 text-2xl font-semibold tabular-nums", k.tone)}>{k.value}</p>
          </Card>
        ))}
      </div>
      <Card>
        <Table rows={data.rows} empty="Nadie tiene su fecha esta semana." />
      </Card>
      <div>
        <h2 className="mb-2 text-base font-semibold text-stone-900">En riesgo de perderse</h2>
        <p className="mb-2 text-sm text-stone-600">Clientes fieles que llevan más del doble de su ciclo sin volver.</p>
        <Card>
          <Table rows={data.atRisk} empty="Ningún cliente en riesgo. 🎉" />
        </Card>
      </div>
    </div>
  );
}
