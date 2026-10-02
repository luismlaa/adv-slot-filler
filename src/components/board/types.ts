import type { BoardAppointment, BoardGap, BoardView } from "@/services/views/board";

export type { BoardAppointment, BoardGap, BoardView };

export interface FreeSlot {
  readonly staffId: string;
  readonly start: string;
  readonly end: string;
}

/** Píxeles por minuto del tablero. */
export const PX_PER_MINUTE = 1.5;
