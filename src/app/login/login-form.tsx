"use client";

import { createBrowserClient } from "@supabase/ssr";
import { useState } from "react";
import { Button, ErrorNote, Field, inputClass } from "@/components/ui/primitives";

/** Enlace mágico por correo (Supabase Auth): el dueño y recepción entran sin contraseña. */
export function LoginForm({ next, failed }: { next: string; failed: boolean }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | undefined>(failed ? "El enlace venció o no es válido. Pide otro." : undefined);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
      setError("La autenticación aún no está configurada (fase de deploy D1).");
      return;
    }
    setBusy(true);
    setError(undefined);
    const supabase = createBrowserClient(url, key);
    const { error: authError } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`, shouldCreateUser: false },
    });
    setBusy(false);
    if (authError) setError("No pudimos enviar el enlace. Verifica el correo.");
    else setSent(true);
  };

  if (sent) return <p className="rounded-lg bg-teal-50 p-4 text-sm text-teal-900">Te enviamos un enlace a {email}. Ábrelo en este dispositivo para entrar.</p>;
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <Field label="Correo del salón">
        <input type="email" required className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
      </Field>
      {error && <ErrorNote message={error} />}
      <Button type="submit" disabled={busy || !email}>
        {busy ? "Enviando…" : "Enviarme el enlace"}
      </Button>
      <p className="text-xs text-stone-500">Solo entran usuarios que el dueño del salón invitó.</p>
    </form>
  );
}
