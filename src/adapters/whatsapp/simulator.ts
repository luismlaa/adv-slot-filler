import type { MessagingChannel } from "@/ports";

/**
 * Canal de la demo: no sale nada a internet. El mensaje ya queda persistido por el servicio de
 * notificaciones y el teléfono simulado lo lee por SSE.
 */
export function createSimulatorChannel(newId: () => string): MessagingChannel {
  return {
    name: "simulator",
    send: async () => ({ providerMessageId: `sim-${newId()}`, delivered: true }),
  };
}
