"use client";

import { useState } from "react";
import { sendJson } from "@/components/live/live-provider";
import { Button, cx } from "@/components/ui/primitives";

export interface StepResult {
  focusDate?: string;
  persona?: string;
  note: string;
}

interface Scene {
  readonly title: string;
  readonly pitch: string;
  readonly steps: readonly { id: string; label: string }[];
  readonly link?: { href: string; label: string };
}

/** El guion del pitch: cada escena se cuenta en una frase y se ejecuta con un clic. */
export const SCENES: readonly Scene[] = [
  {
    title: "1 · «Quiero corte con Carlos el sábado»",
    pitch: "El cliente escribe como habla. Si Carlos está lleno, el sistema no dice «no»: ofrece lo más cercano.",
    steps: [
      { id: "pedro-ask", label: "Pedro escribe" },
      { id: "pedro-choose", label: "Pedro elige la 1" },
    ],
  },
  {
    title: "2 · Alguien cancela → el hueco se rellena solo",
    pitch: "Una cancelación ya no es plata perdida: la oferta sale a la lista de espera y el primero que dice «sí» se la queda.",
    steps: [
      { id: "juan-cancel", label: "Juan avisa" },
      { id: "juan-confirm", label: "Juan confirma" },
      { id: "jose-accept", label: "José acepta" },
    ],
  },
  {
    title: "3 · «Ya van 4 semanas, ¿te aparto?»",
    pitch: "Cada cliente tiene su propio ritmo. El sistema lo aprende de su historial y lo invita justo cuando le toca.",
    steps: [
      { id: "jump-to-pedro-cycle", label: "Avanzar 4 semanas" },
      { id: "pedro-yes", label: "Pedro dice sí" },
    ],
  },
  {
    title: "4 · Se monta en el calendario del barbero",
    pitch: "Carlos sigue usando su Google Calendar. Lo personal bloquea la agenda; sus citas aparecen allá.",
    steps: [{ id: "carlos-google-event", label: "Carlos agenda algo personal" }],
  },
  {
    title: "5 · El retorno, en pesos",
    pitch: "Lo que el salón recuperó este mes gracias a huecos rellenados y clientes que volvieron a tiempo.",
    steps: [],
    link: { href: "/metricas", label: "Abrir métricas" },
  },
];

export function Director({ onResult }: { onResult: (result: StepResult) => void }) {
  const [done, setDone] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState<string>();
  const [note, setNote] = useState<string>();
  const [error, setError] = useState<string>();

  const run = async (id: string) => {
    setBusy(id);
    setError(undefined);
    try {
      const result = await sendJson<StepResult>("/api/demo/script", "POST", { step: id });
      setDone((prev) => new Set([...prev, id]));
      setNote(result.note);
      onResult(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "El paso falló");
    } finally {
      setBusy(undefined);
    }
  };

  return (
    <section aria-label="Guion de la demo" className="flex flex-col gap-3">
      {SCENES.map((scene) => (
        <div key={scene.title} className="rounded-xl border border-stone-200 bg-white p-3 shadow-sm">
          <h3 className="text-sm font-semibold text-stone-900">{scene.title}</h3>
          <p className="mt-0.5 text-xs leading-snug text-stone-600">{scene.pitch}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {scene.steps.map((step) => (
              <Button
                key={step.id}
                variant={done.has(step.id) ? "secondary" : "primary"}
                className={cx("px-2.5 py-1 text-xs", done.has(step.id) && "text-emerald-700")}
                onClick={() => run(step.id)}
                disabled={busy !== undefined}
              >
                {busy === step.id ? "…" : done.has(step.id) ? `✓ ${step.label}` : step.label}
              </Button>
            ))}
            {scene.link && (
              <a href={scene.link.href} target="_blank" rel="noreferrer" className="rounded-lg bg-teal-700 px-2.5 py-1 text-xs font-medium text-white hover:bg-teal-800">
                {scene.link.label} ↗
              </a>
            )}
          </div>
        </div>
      ))}
      {note && <p className="rounded-lg bg-teal-50 p-3 text-sm leading-snug text-teal-900" role="status">{note}</p>}
      {error && <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
    </section>
  );
}
