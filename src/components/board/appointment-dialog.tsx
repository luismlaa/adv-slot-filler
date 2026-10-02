"use client";

import { useState } from "react";
import { sendJson } from "@/components/live/live-provider";
import { Badge, Button, ErrorNote, Field, Modal, inputClass } from "@/components/ui/primitives";
import { formatMoney, labelAt, shortDate, localDateIn } from "@/lib/client-format";
import type { BoardAppointment } from "./types";

const SOURCE_LABEL: Record<BoardAppointment["source"], string> = {
  whatsapp: "Reservó por WhatsApp",
  salon: "Reservada desde el salón",
  gapfill: "Rellenó un hueco por cancelación",
  reactivation: "Volvió por invitación de ciclo",
  walkin: "Llegó sin cita",
  import: "Importada del sistema anterior",
};

interface Props {
  appointment: BoardAppointment | undefined;
  staffName: string;
  timezone: string;
  currency: string;
  onClose: () => void;
}

export function AppointmentDialog({ appointment, staffName, timezone, currency, onClose }: Props) {
  const [reason, setReason] = useState("El cliente avisó que no puede venir");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const cancel = async () => {
    if (!appointment) return;
    setBusy(true);
    setError(undefined);
    try {
      await sendJson(`/api/appointments/${appointment.id}/cancel`, "POST", { reason });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cancelar");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={appointment !== undefined} onClose={onClose} title={appointment ? appointment.clientName : "Cita"}>
      {appointment && (
        <div className="flex flex-col gap-4 text-sm">
          <dl className="grid grid-cols-[7rem_1fr] gap-y-1.5">
            <dt className="text-stone-500">Servicio</dt>
            <dd className="font-medium">{appointment.serviceName}</dd>
            <dt className="text-stone-500">Con</dt>
            <dd>{staffName}</dd>
            <dt className="text-stone-500">Cuándo</dt>
            <dd>
              {shortDate(localDateIn(appointment.start, timezone))} · {labelAt(appointment.start, timezone)} – {labelAt(appointment.end, timezone)}
            </dd>
            <dt className="text-stone-500">Teléfono</dt>
            <dd className="tabular-nums">{appointment.clientPhone}</dd>
            <dt className="text-stone-500">Precio</dt>
            <dd>{formatMoney(appointment.price, currency)}</dd>
            <dt className="text-stone-500">Origen</dt>
            <dd>
              <Badge tone={appointment.source === "gapfill" ? "emerald" : appointment.source === "reactivation" ? "violet" : "neutral"}>{SOURCE_LABEL[appointment.source]}</Badge>
            </dd>
          </dl>
          {appointment.status === "booked" ? (
            <div className="flex flex-col gap-2 border-t border-stone-100 pt-3">
              <Field label="Motivo de la cancelación">
                <input className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} />
              </Field>
              <p className="text-xs text-stone-500">Al cancelar, Slot Filler ofrece el espacio automáticamente a la lista de espera y a los clientes a los que les toca volver.</p>
              {error && <ErrorNote message={error} />}
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={onClose}>
                  Cerrar
                </Button>
                <Button variant="danger" onClick={cancel} disabled={busy}>
                  {busy ? "Cancelando…" : "Cancelar cita y rellenar"}
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-stone-500">Esta cita ya {appointment.status === "completed" ? "se atendió" : "no está vigente"}.</p>
          )}
        </div>
      )}
    </Modal>
  );
}
