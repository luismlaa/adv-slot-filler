import type { BusinessConfig } from "@/config/business";
import type { Id, LocalDate, LocalTime } from "../model";
import type { ScheduleSnapshot } from "../time";

/** Lo que pide el cliente, ya interpretado: "corte con Carlos el sábado en la tarde". */
export interface BookingRequest {
  readonly serviceId: Id;
  readonly staffId?: Id;
  readonly date?: LocalDate;
  /** Hora exacta pedida ("a las 3"). */
  readonly time?: LocalTime;
  /** Franja pedida ("en la tarde"). Ignorada si hay `time`. */
  readonly window?: { readonly from: LocalTime; readonly to: LocalTime };
  /** Estilista habitual del cliente — desempata cuando no pidió a nadie. */
  readonly preferredStaffId?: Id;
}

export type SlotKind = "match" | "same_staff_other_time" | "other_staff_same_day" | "other_staff_other_day" | "other_time";

export interface SlotOption {
  readonly staffId: Id;
  readonly serviceId: Id;
  readonly start: string;
  readonly end: string;
  readonly kind: SlotKind;
  readonly score: number;
}

export type AllocationReason =
  | "unknown_service"
  | "unknown_staff"
  | "staff_lacks_specialty"
  | "staff_off"
  | "staff_full"
  | "time_taken"
  | "no_capacity";

export interface AllocationResult {
  /** available = hay opciones que cumplen lo pedido; alternatives = no, pero hay otras; none = nada en el horizonte. */
  readonly status: "available" | "alternatives" | "none";
  readonly reason?: AllocationReason;
  readonly matches: readonly SlotOption[];
  readonly alternatives: readonly SlotOption[];
}

export interface AllocationContext {
  readonly snapshot: ScheduleSnapshot;
  readonly now: number;
  readonly config: BusinessConfig;
}
