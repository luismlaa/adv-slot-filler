import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar · Slot Filler" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : "/agenda";
  return (
    <main className="flex flex-1 items-center justify-center bg-stone-50 p-6">
      <div className="w-full max-w-sm rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <h1 className="mb-1 text-xl font-semibold text-stone-900">Entrar a Slot Filler</h1>
        <p className="mb-4 text-sm text-stone-600">Te enviamos un enlace de acceso a tu correo.</p>
        <LoginForm next={next} failed={params.error !== undefined} />
      </div>
    </main>
  );
}
