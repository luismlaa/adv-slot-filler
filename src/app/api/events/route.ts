import { requireSalonMember } from "@/lib/auth";
import { getContainer } from "@/lib/container";
import { HttpError } from "@/lib/http-error";

export const dynamic = "force-dynamic";

/** Stream SSE de eventos de dominio: el tablero y el teléfono simulado se refrescan al instante. */
export async function GET(request: Request) {
  try {
    await requireSalonMember();
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    return Response.json({ error: error instanceof Error ? error.message : "Error" }, { status });
  }
  const { ctx } = getContainer();
  const encoder = new TextEncoder();
  let unsubscribe = () => {};
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (data: string) => {
        try {
          controller.enqueue(encoder.encode(data));
        } catch {
          unsubscribe();
        }
      };
      send(`retry: 2000\n\n`);
      unsubscribe = ctx.bus.subscribe((event) => send(`data: ${JSON.stringify(event)}\n\n`));
      heartbeat = setInterval(() => send(`: ping\n\n`), 15_000);
      request.signal.addEventListener("abort", () => {
        unsubscribe();
        clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          // ya cerrado
        }
      });
    },
    cancel() {
      unsubscribe();
      clearInterval(heartbeat);
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" },
  });
}
