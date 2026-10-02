import type { WaitlistEntry } from "@/domain/model";
import type { AppContext } from "../context";

export interface WaitlistRow {
  readonly id: string;
  readonly clientName: string;
  readonly phone: string;
  readonly serviceName: string;
  readonly staffNames: readonly string[];
  readonly windowStart: string;
  readonly windowEnd: string;
  readonly status: WaitlistEntry["status"];
  readonly createdAt: string;
}

export async function waitlistView(ctx: AppContext): Promise<WaitlistRow[]> {
  const [entries, clients, staff, services] = await Promise.all([
    ctx.store.waitlist.list(),
    ctx.store.clients.list(),
    ctx.store.staff.list(),
    ctx.store.services.list(),
  ]);
  return entries
    .map((e) => {
      const client = clients.find((c) => c.id === e.clientId);
      return {
        id: e.id,
        clientName: client?.name ?? "Cliente",
        phone: client?.phone ?? "",
        serviceName: services.find((s) => s.id === e.serviceId)?.name ?? "",
        staffNames: e.staffIds.map((id) => staff.find((s) => s.id === id)?.name ?? id),
        windowStart: e.windowStart,
        windowEnd: e.windowEnd,
        status: e.status,
        createdAt: e.createdAt,
      };
    })
    .sort((a, b) => (a.status === "active" ? 0 : 1) - (b.status === "active" ? 0 : 1) || a.windowStart.localeCompare(b.windowStart));
}
