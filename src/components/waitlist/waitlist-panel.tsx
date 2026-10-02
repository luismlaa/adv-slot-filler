"use client";

import { useEffect, useState } from "react";
import { sendJson, useLiveQuery } from "@/components/live/live-provider";
import { Badge, Button, Card, ErrorNote, Field, Spinner, inputClass } from "@/components/ui/primitives";
import type { Service, Staff, WaitlistEntry } from "@/domain/model";
import { labelAt, localDateIn, shortDate } from "@/lib/client-format";
import type { WaitlistRow } from "@/services/views/waitlist";

const STATUS: Record<WaitlistEntry["status"], { label: string; tone: "teal" | "emerald" | "neutral" }> = {
  active: { label: "Esperando", tone: "teal" },
  fulfilled: { label: "✅ Consiguió espacio", tone: "emerald" },
  expired: { label: "Venció", tone: "neutral" },
  cancelled: { label: "Retirado", tone: "neutral" },
};

interface Settings {
  salon: { timezone: string };
  staff: Staff[];
  services: Service[];
}

function AddForm({ settings }: { settings: Settings }) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<{ id: string; name: string; phone: string }[]>([]);
  const [clientId, setClientId] = useState("");
  const [serviceId, setServiceId] = useState(settings.services[0]?.id ?? "");
  const [staffId, setStaffId] = useState("");
  const [date, setDate] = useState("");
  const [from, setFrom] = useState("09:00");
  const [to, setTo] = useState("19:00");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (query.trim().length < 2) return;
    const controller = new AbortController();
    fetch(`/api/clients?q=${encodeURIComponent(query)}`, { signal: controller.signal })
      .then((r) => r.json())
      .then(setHits)
      .catch(() => undefined);
    return () => controller.abort();
  }, [query]);

  /** Convierte fecha+hora locales del salón a ISO usando el offset de la zona en ese día. */
  const toIso = (day: string, time: string) => {
    const guess = new Date(`${day}T${time}:00Z`);
    const local = new Date(guess.toLocaleString("en-US", { timeZone: settings.salon.timezone }));
    const utc = new Date(guess.toLocaleString("en-US", { timeZone: "UTC" }));
    return new Date(guess.getTime() + (utc.getTime() - local.getTime())).toISOString();
  };

  const submit = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await sendJson("/api/waitlist", "POST", {
        clientId,
        serviceId,
        staffIds: staffId ? [staffId] : [],
        windowStart: toIso(date, from),
        windowEnd: toIso(date, to),
      });
      setClientId("");
      setQuery("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo agregar");
    } finally {
      setBusy(false);
    }
  };

  const visibleHits = query.trim().length >= 2 && !clientId ? hits : [];
  return (
    <Card className="p-4">
      <h2 className="mb-3 text-base font-semibold text-stone-900">Anotar en lista de espera</h2>
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="Cliente">
          <input className={inputClass} value={query} onChange={(e) => { setQuery(e.target.value); setClientId(""); }} placeholder="Nombre o teléfono" />
        </Field>
        <Field label="Servicio">
          <select className={inputClass} value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
            {settings.services.filter((s) => s.active).map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Con">
          <select className={inputClass} value={staffId} onChange={(e) => setStaffId(e.target.value)}>
            <option value="">Cualquiera con la especialidad</option>
            {settings.staff.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Día">
          <input type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Desde">
          <input type="time" className={inputClass} value={from} onChange={(e) => setFrom(e.target.value)} step={900} />
        </Field>
        <Field label="Hasta">
          <input type="time" className={inputClass} value={to} onChange={(e) => setTo(e.target.value)} step={900} />
        </Field>
      </div>
      {visibleHits.length > 0 && (
        <ul className="mt-2 max-h-36 overflow-y-auto rounded-lg border border-stone-200 text-sm">
          {visibleHits.map((h) => (
            <li key={h.id}>
              <button type="button" className="w-full px-3 py-1.5 text-left hover:bg-stone-50" onClick={() => { setClientId(h.id); setQuery(h.name); }}>
                {h.name} <span className="tabular-nums text-stone-400">{h.phone}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <div className="mt-2"><ErrorNote message={error} /></div>}
      <div className="mt-3 flex justify-end">
        <Button onClick={submit} disabled={busy || !clientId || !date}>{busy ? "Guardando…" : "Anotar"}</Button>
      </div>
    </Card>
  );
}

export function WaitlistPanel() {
  const list = useLiveQuery<WaitlistRow[]>("/api/waitlist", ["waitlist.changed", "gap.filled", "demo.reset"]);
  const settings = useLiveQuery<Settings>("/api/settings", ["demo.reset"]);
  if (list.error) return <ErrorNote message={list.error} />;
  if (!list.data || !settings.data) return <Spinner />;
  const tz = settings.data.salon.timezone;
  const remove = (id: string) => sendJson(`/api/waitlist/${id}`, "DELETE").catch(() => undefined);
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-stone-900">Lista de espera</h1>
        <p className="text-sm text-stone-600">Cuando alguien cancela, estos clientes reciben la oferta primero por WhatsApp. El primero que responde se queda con el espacio.</p>
      </div>
      <AddForm settings={settings.data} />
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[44rem] text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-stone-500">
            <tr>
              <th className="px-3 py-2 font-medium">Cliente</th>
              <th className="px-3 py-2 font-medium">Servicio</th>
              <th className="px-3 py-2 font-medium">Con</th>
              <th className="px-3 py-2 font-medium">Puede venir</th>
              <th className="px-3 py-2 font-medium">Estado</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {list.data.map((row) => (
              <tr key={row.id} className="border-t border-stone-100">
                <td className="px-3 py-2.5">
                  <p className="font-medium">{row.clientName}</p>
                  <p className="text-xs tabular-nums text-stone-500">{row.phone}</p>
                </td>
                <td className="px-3 py-2.5">{row.serviceName}</td>
                <td className="px-3 py-2.5">{row.staffNames.length ? row.staffNames.join(", ") : "Cualquiera"}</td>
                <td className="px-3 py-2.5 tabular-nums">
                  {shortDate(localDateIn(row.windowStart, tz))} · {labelAt(row.windowStart, tz)} – {localDateIn(row.windowEnd, tz) !== localDateIn(row.windowStart, tz) ? `${shortDate(localDateIn(row.windowEnd, tz))} · ` : ""}
                  {labelAt(row.windowEnd, tz)}
                </td>
                <td className="px-3 py-2.5"><Badge tone={STATUS[row.status].tone}>{STATUS[row.status].label}</Badge></td>
                <td className="px-3 py-2.5 text-right">
                  {row.status === "active" && <Button variant="ghost" onClick={() => remove(row.id)}>Retirar</Button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
