import type { ReactNode } from "react";

interface Props {
  title: string;
  updated: string;
  operator: { name: string | undefined; email: string | undefined };
  children: ReactNode;
}

/** Marco común de las páginas legales: legible, imprimible y con aviso si aún es borrador. */
export function LegalPage({ title, updated, operator, children }: Props) {
  const draft = !operator.name || !operator.email;
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 text-stone-800 sm:px-6">
      {draft && (
        <p role="note" className="mb-6 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
          Borrador: falta configurar el operador del servicio (LEGAL_ENTITY_NAME y LEGAL_CONTACT_EMAIL) y la revisión de un abogado antes de publicarlo.
        </p>
      )}
      <h1 className="text-3xl font-semibold tracking-tight text-stone-900">{title}</h1>
      <p className="mt-1 text-sm text-stone-500">Última actualización: {updated}</p>
      <div className="mt-8 space-y-6 leading-relaxed [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-stone-900 [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-1">
        {children}
      </div>
    </main>
  );
}

export const operatorName = (name: string | undefined) => name ?? "[Razón social del operador]";
export const operatorEmail = (email: string | undefined) => email ?? "[correo de contacto]";
