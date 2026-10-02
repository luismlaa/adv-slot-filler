import type { TenantDirectory } from "@/ports";

/** Demo en memoria: un solo salón (el del seed), abierto a todos. */
export function createMemoryDirectory(salonId: () => string): TenantDirectory {
  return {
    activeSalonIds: async () => [salonId()],
    salonForWhatsAppNumber: async () => salonId(),
    salonForCalendarChannel: async () => salonId(),
    membershipsOf: async () => [{ salonId: salonId(), role: "owner", staffId: undefined }],
    ping: async () => undefined,
  };
}
