import { getEnv } from "@/config/env";

export function GET() {
  const env = getEnv();
  return Response.json({
    status: "ok",
    demo: env.DEMO_MODE,
    backend: env.DATA_BACKEND,
    messaging: env.MESSAGING_CHANNEL,
    calendar: env.CALENDAR_PROVIDER,
    llm: env.LLM_PROVIDER,
  });
}
