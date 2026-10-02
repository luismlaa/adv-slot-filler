import { getContainer } from "@/lib/container";

export const dynamic = "force-dynamic";

/** Healthcheck: configuración cargada y base de datos alcanzable. 503 si algo falla. */
export async function GET() {
  const started = Date.now();
  try {
    const { env, directory } = getContainer();
    await directory.ping();
    return Response.json(
      {
        status: "ok",
        demo: env.DEMO_MODE,
        backend: env.DATA_BACKEND,
        messaging: env.MESSAGING_CHANNEL,
        dryRun: env.MESSAGING_DRY_RUN,
        calendar: env.CALENDAR_PROVIDER,
        llm: env.LLM_PROVIDER,
        latencyMs: Date.now() - started,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return Response.json({ status: "error", error: error instanceof Error ? error.message : String(error) }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
