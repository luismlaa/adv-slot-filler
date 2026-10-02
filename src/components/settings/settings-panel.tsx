"use client";

import { useState } from "react";
import { sendJson, useLiveQuery } from "@/components/live/live-provider";
import { Badge, Button, Card, ErrorNote, Field, Spinner, inputClass } from "@/components/ui/primitives";
import type { BusinessConfig } from "@/config/business";
import type { CalendarLink, Service, Specialty, Staff } from "@/domain/model";
import { formatMoney } from "@/lib/client-format";

interface SettingsData {
  salon: { name: string; timezone: string; currency: string; phone?: string; address?: string };
  config: BusinessConfig;
  staff: Staff[];
  services: Service[];
  specialties: Specialty[];
  calendarLinks: Omit<CalendarLink, "refreshToken">[];
}

const WEEKDAYS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center justify-between gap-3 text-sm">
      <span className="text-stone-700">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 rounded-full transition ${checked ? "bg-teal-700" : "bg-stone-300"}`}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${checked ? "left-[22px]" : "left-0.5"}`} />
      </button>
    </label>
  );
}

function AutomationCard({ config }: { config: BusinessConfig }) {
  const [draft, setDraft] = useState(config);
  const [saved, setSaved] = useState<string>();
  const [error, setError] = useState<string>();
  const set = <K extends keyof BusinessConfig>(section: K, patch: Partial<BusinessConfig[K]>) => setDraft((d) => ({ ...d, [section]: { ...d[section], ...patch } }));
  const save = async () => {
    setError(undefined);
    try {
      await sendJson("/api/settings", "PUT", { gapfill: draft.gapfill, reactivation: draft.reactivation, messaging: draft.messaging, cycles: { dueWindowBeforeDays: draft.cycles.dueWindowBeforeDays, dueWindowAfterDays: draft.cycles.dueWindowAfterDays } });
      setSaved("Guardado ✓");
      setTimeout(() => setSaved(undefined), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    }
  };
  const num = (value: number, onChange: (n: number) => void, min = 0, max = 999) => (
    <input type="number" className={`${inputClass} w-24`} value={value} min={min} max={max} onChange={(e) => onChange(Number(e.target.value))} />
  );
  return (
    <Card className="p-5">
      <h2 className="text-base font-semibold text-stone-900">Automatización</h2>
      <p className="mb-4 text-sm text-stone-600">Todo corre solo. Aquí decides qué se automatiza y con qué reglas.</p>
      <div className="grid gap-6 md:grid-cols-2">
        <div className="flex flex-col gap-3">
          <Toggle label="Rellenar huecos automáticamente al cancelar" checked={draft.gapfill.mode === "auto"} onChange={(v) => set("gapfill", { mode: v ? "auto" : "off" })} />
          <Field label="Minutos que dura cada oferta">{num(draft.gapfill.offerTtlMinutes, (n) => set("gapfill", { offerTtlMinutes: n }), 1, 240)}</Field>
          <Field label="Clientes por ola">{num(draft.gapfill.waveSize, (n) => set("gapfill", { waveSize: n }), 1, 20)}</Field>
          <Field label="Máximo de olas por hueco">{num(draft.gapfill.maxWaves, (n) => set("gapfill", { maxWaves: n }), 1, 10)}</Field>
          <Field label="No ofrecer si falta menos de (min)">{num(draft.gapfill.minNoticeMinutes, (n) => set("gapfill", { minNoticeMinutes: n }), 0, 600)}</Field>
        </div>
        <div className="flex flex-col gap-3">
          <Toggle label="Invitar a volver según el ciclo de cada cliente" checked={draft.reactivation.mode === "auto"} onChange={(v) => set("reactivation", { mode: v ? "auto" : "off" })} />
          <Field label="Hora de envío de invitaciones">{num(draft.reactivation.sendHourLocal, (n) => set("reactivation", { sendHourLocal: n }), 0, 23)}</Field>
          <Field label="Avisar días antes de la fecha">{num(draft.reactivation.leadDays, (n) => set("reactivation", { leadDays: n }), 0, 14)}</Field>
          <Field label="No escribir desde (hora)">{num(draft.messaging.quietHoursStart, (n) => set("messaging", { quietHoursStart: n }), 0, 23)}</Field>
          <Field label="hasta (hora)">{num(draft.messaging.quietHoursEnd, (n) => set("messaging", { quietHoursEnd: n }), 0, 23)}</Field>
        </div>
      </div>
      {error && <div className="mt-3"><ErrorNote message={error} /></div>}
      <div className="mt-4 flex items-center justify-end gap-3">
        {saved && <span className="text-sm text-emerald-700">{saved}</span>}
        <Button onClick={save}>Guardar reglas</Button>
      </div>
    </Card>
  );
}

function StaffCard({ staff, specialties, links }: { staff: Staff; specialties: Specialty[]; links: SettingsData["calendarLinks"] }) {
  const [draft, setDraft] = useState(staff);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const link = links.find((l) => l.staffId === staff.id);
  const toggle = (id: string) =>
    setDraft((d) => ({ ...d, specialties: d.specialties.includes(id) ? d.specialties.filter((s) => s !== id) : [...d.specialties, id] }));
  const save = async () => {
    setState("saving");
    try {
      await sendJson(`/api/staff/${staff.id}`, "PUT", draft);
      setState("saved");
    } catch {
      setState("error");
    }
  };
  return (
    <div className="flex flex-col gap-2 border-t border-stone-100 py-3 first:border-t-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full" style={{ backgroundColor: staff.color }} aria-hidden />
          <span className="font-medium text-stone-900">{staff.name}</span>
          {staff.aliases.length > 0 && <span className="text-xs text-stone-500">({staff.aliases.join(", ")})</span>}
        </div>
        {link ? <Badge tone="sky">📆 Google Calendar conectado</Badge> : <Badge>Sin calendario externo</Badge>}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {specialties.map((sp) => (
          <button
            key={sp.id}
            type="button"
            onClick={() => toggle(sp.id)}
            aria-pressed={draft.specialties.includes(sp.id)}
            className={`rounded-full px-2.5 py-1 text-xs ring-1 ${draft.specialties.includes(sp.id) ? "bg-teal-50 text-teal-800 ring-teal-300" : "bg-white text-stone-500 ring-stone-200"}`}
          >
            {sp.name}
          </button>
        ))}
      </div>
      <p className="text-xs text-stone-500">
        {staff.schedule
          .map((ranges, day) => (ranges.length ? `${WEEKDAYS[day]} ${ranges.map((r) => `${r.start}–${r.end}`).join(", ")}` : null))
          .filter(Boolean)
          .join(" · ")}
      </p>
      <div className="flex items-center justify-end gap-2">
        {state === "saved" && <span className="text-xs text-emerald-700">Guardado ✓</span>}
        {state === "error" && <span className="text-xs text-rose-600">No se pudo guardar</span>}
        <Button variant="secondary" onClick={save} disabled={state === "saving"}>Guardar especialidades</Button>
      </div>
    </div>
  );
}

export function SettingsPanel() {
  const { data, error } = useLiveQuery<SettingsData>("/api/settings", ["demo.reset", "calendar.synced"]);
  if (error) return <ErrorNote message={error} />;
  if (!data) return <Spinner />;
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-stone-900">Ajustes</h1>
        <p className="text-sm text-stone-600">
          {data.salon.name} · {data.salon.address} · zona horaria {data.salon.timezone}
        </p>
      </div>
      <AutomationCard config={data.config} />
      <Card className="p-5">
        <h2 className="text-base font-semibold text-stone-900">Estilistas y especialidades</h2>
        <p className="mb-2 text-sm text-stone-600">Las reservas solo se asignan a quien tiene la especialidad del servicio.</p>
        {data.staff.map((s) => (
          <StaffCard key={s.id} staff={s} specialties={data.specialties} links={data.calendarLinks} />
        ))}
      </Card>
      <Card className="overflow-x-auto p-5">
        <h2 className="mb-2 text-base font-semibold text-stone-900">Servicios</h2>
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-stone-500">
            <tr>
              <th className="py-1.5 font-medium">Servicio</th>
              <th className="py-1.5 font-medium">Duración</th>
              <th className="py-1.5 font-medium">Precio</th>
              <th className="py-1.5 font-medium">Ciclo típico</th>
              <th className="py-1.5 font-medium">Requiere</th>
            </tr>
          </thead>
          <tbody>
            {data.services.map((s) => (
              <tr key={s.id} className="border-t border-stone-100">
                <td className="py-2">
                  <p className="font-medium">{s.name}</p>
                  <p className="text-xs text-stone-500">dicen: {s.keywords.slice(0, 4).join(", ")}</p>
                </td>
                <td className="py-2 tabular-nums">{s.durationMinutes} min</td>
                <td className="py-2 tabular-nums">{formatMoney(s.price, data.salon.currency)}</td>
                <td className="py-2 tabular-nums">cada {s.defaultCycleDays} días</td>
                <td className="py-2">{s.requiredSpecialties.map((r) => data.specialties.find((sp) => sp.id === r)?.name ?? r).join(" + ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-stone-500">El ciclo típico solo se usa con clientes nuevos; con historial, cada cliente tiene su propio ciclo.</p>
      </Card>
    </div>
  );
}
