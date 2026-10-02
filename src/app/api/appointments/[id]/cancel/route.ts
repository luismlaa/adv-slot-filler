import { z } from "zod";
import { HttpError, json, parseBody, salonRoute } from "@/lib/http";
import { cancelAppointment } from "@/services/booking";
import { openGapForCancellation } from "@/services/gapfill";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ reason: z.string().max(200).default("Cancelada desde el salón") });

/** Cancela una cita y, si hay tiempo, abre el hueco y lanza las ofertas automáticamente. */
export const POST = salonRoute(async ({ ctx }, request: Request, context: RouteContext<"/api/appointments/[id]/cancel">) => {
  const { id } = await context.params;
  const { reason } = await parseBody(request, bodySchema);
  const cancelled = await cancelAppointment(ctx, id, reason);
  if (!cancelled) throw new HttpError(409, "La cita ya no estaba reservada");
  const gap = await openGapForCancellation(ctx, cancelled);
  return json({ appointment: cancelled, gap: gap ?? null });
});
