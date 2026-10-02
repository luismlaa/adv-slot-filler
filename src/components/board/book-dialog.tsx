"use client";

import { useEffect, useMemo, useState } from "react";
import { sendJson } from "@/components/live/live-provider";
import { Button, ErrorNote, Field, Modal, inputClass } from "@/components/ui/primitives";
import { labelAt } from "@/lib/client-format";
import type { Service } from "@/domain/model";
import type { FreeSlot } from "./types";

interface ClientHit {
  id: string;
  name: string;
  phone: string;
}

interface Props {
  slot: FreeSlot | undefined;
  staff: readonly { id: string; name: string; specialties: readonly string[] }[];
  services: readonly Service[];
  timezone: string;
  onClose: () => void;
}

/** Reserva desde el salón sobre un espacio libre del tablero. El padre lo remonta (key) por cada espacio. */
export function BookDialog({ slot, staff, services, timezone, onClose }: Props) {
  const member = staff.find((s) => s.id === slot?.staffId);
  const eligible = useMemo(
    () => services.filter((s) => s.active && member !== undefined && s.requiredSpecialties.every((r) => member.specialties.includes(r))),
    [services, member],
  );
  const [serviceId, setServiceId] = useState(() => eligible[0]?.id ?? "");
  const [startIso, setStartIso] = useState(() => slot?.start ?? "");
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<ClientHit[]>([]);
  const [client, setClient] = useState<ClientHit>();
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [walkIn, setWalkIn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (query.trim().length < 2) return;
    const controller = new AbortController();
    fetch(`/api/clients?q=${encodeURIComponent(query)}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((data: ClientHit[]) => setHits(data))
      .catch(() => undefined);
    return () => controller.abort();
  }, [query]);

  const visibleHits = query.trim().length >= 2 ? hits : [];
  const service = eligible.find((s) => s.id === serviceId);
  const starts = useMemo(() => {
    if (!slot || !service) return [];
    const out: string[] = [];
    for (let t = Date.parse(slot.start); t + service.durationMinutes * 60_000 <= Date.parse(slot.end); t += 15 * 60_000) out.push(new Date(t).toISOString());
    return out;
  }, [slot, service]);

  const submit = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await sendJson("/api/appointments", "POST", {
        staffId: slot?.staffId,
        serviceId,
        start: startIso,
        clientId: client?.id,
        newClient: client ? undefined : { name: newName, phone: newPhone },
        walkIn,
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo reservar");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={slot !== undefined} onClose={onClose} title={member ? `Reservar con ${member.name}` : "Reservar"}>
      <div className="flex flex-col gap-3">
        <Field label="Servicio">
          <select className={inputClass} value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
            {eligible.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {s.durationMinutes} min
              </option>
            ))}
          </select>
        </Field>
        <Field label="Hora">
          <select className={inputClass} value={startIso} onChange={(e) => setStartIso(e.target.value)}>
            {starts.map((iso) => (
              <option key={iso} value={iso}>
                {labelAt(iso, timezone)}
              </option>
            ))}
          </select>
        </Field>
        {starts.length === 0 && <ErrorNote message="Ese servicio no cabe en este espacio." />}
        <Field label="Cliente">
          {client ? (
            <div className="flex items-center justify-between rounded-lg bg-teal-50 px-3 py-1.5 text-sm">
              <span>
                {client.name} · <span className="tabular-nums text-stone-500">{client.phone}</span>
              </span>
              <button type="button" className="text-xs text-teal-800 underline" onClick={() => setClient(undefined)}>
                cambiar
              </button>
            </div>
          ) : (
            <input className={inputClass} placeholder="Buscar por nombre o teléfono" value={query} onChange={(e) => setQuery(e.target.value)} />
          )}
        </Field>
        {!client && visibleHits.length > 0 && (
          <ul className="max-h-36 overflow-y-auto rounded-lg border border-stone-200 text-sm">
            {visibleHits.map((h) => (
              <li key={h.id}>
                <button type="button" className="w-full px-3 py-1.5 text-left hover:bg-stone-50" onClick={() => setClient(h)}>
                  {h.name} <span className="tabular-nums text-stone-400">{h.phone}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {!client && (
          <div className="grid grid-cols-2 gap-2">
            <Field label="o cliente nuevo: nombre">
              <input className={inputClass} value={newName} onChange={(e) => setNewName(e.target.value)} />
            </Field>
            <Field label="teléfono">
              <input className={inputClass} value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="809-555-0000" inputMode="tel" />
            </Field>
          </div>
        )}
        <label className="flex items-center gap-2 text-sm text-stone-700">
          <input type="checkbox" checked={walkIn} onChange={(e) => setWalkIn(e.target.checked)} /> Llegó sin cita (walk-in)
        </label>
        {error && <ErrorNote message={error} />}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={busy || !startIso || (!client && (!newName || !newPhone))}>
            {busy ? "Reservando…" : "Reservar"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

