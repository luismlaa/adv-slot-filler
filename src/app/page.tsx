import Link from "next/link";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-3xl font-semibold tracking-tight">Slot Filler</h1>
      <p className="max-w-md text-center text-neutral-600">
        Reparte reservas por especialidad, rellena huecos y trae a cada cliente en su ciclo.
      </p>
      <Link className="rounded-lg bg-neutral-900 px-4 py-2 text-white" href="/demo">
        Abrir demo
      </Link>
    </main>
  );
}
