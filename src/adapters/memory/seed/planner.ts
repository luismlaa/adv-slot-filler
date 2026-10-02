import type { Appointment, AppointmentSource, AppointmentStatus, LocalDate, Service, Staff } from "@/domain/model";
import { type Interval, MINUTE, subtractIntervals, toIso, workingIntervals, zonedInstant } from "@/domain/time";
import { DEMO_SALON_ID, DEMO_TZ } from "./catalog";
import type { Rng } from "./rng";

export interface PlaceOptions {
  /** Hora local preferida en minutos desde medianoche. */
  readonly preferMinutes?: number;
  /** Hora exacta "HH:mm" (falla si no está libre). */
  readonly exact?: string;
}

/**
 * Agenda en construcción para el seed: evita solapamientos al generar historiales.
 * Es un builder local — muta su propio estado y entrega al final una lista inmutable.
 */
export class SeedPlanner {
  private readonly busy = new Map<string, Interval[]>();
  private readonly appts: Appointment[] = [];
  private seq = 0;

  constructor(
    private readonly rng: Rng,
    /** Instante "ahora" de la demo: lo anterior se marca como completado. */
    private readonly anchor: number,
  ) {}

  /** Busca un hueco para el servicio ese día; devuelve el inicio o `undefined`. */
  findStart(staff: Staff, service: Service, date: LocalDate, options: PlaceOptions = {}): number | undefined {
    const free = subtractIntervals(workingIntervals(staff, date, DEMO_TZ), this.busy.get(`${staff.id}|${date}`) ?? []);
    const needed = service.durationMinutes * MINUTE;
    const step = 15 * MINUTE;
    const dayStart = zonedInstant(date, "00:00", DEMO_TZ);
    const starts = free.flatMap((f) => {
      const out: number[] = [];
      for (let s = dayStart + Math.ceil((f.start - dayStart) / step) * step; s + needed <= f.end; s += step) out.push(s);
      return out;
    });
    if (options.exact !== undefined) {
      const wanted = zonedInstant(date, options.exact, DEMO_TZ);
      return starts.includes(wanted) ? wanted : undefined;
    }
    if (starts.length === 0) return undefined;
    if (options.preferMinutes === undefined) return this.rng.pick(starts);
    const target = dayStart + options.preferMinutes * MINUTE;
    const nearest = [...starts].sort((a, b) => Math.abs(a - target) - Math.abs(b - target)).slice(0, 3);
    return this.rng.pick(nearest);
  }

  book(params: {
    staff: Staff;
    service: Service;
    date: LocalDate;
    clientId: string;
    source: AppointmentSource;
    start: number;
    status?: AppointmentStatus;
    id?: string;
    createdAt?: number;
  }): Appointment {
    const { staff, service, date, start } = params;
    const end = start + service.durationMinutes * MINUTE;
    const key = `${staff.id}|${date}`;
    const status = params.status ?? (start < this.anchor ? (this.rng.chance(0.03) ? "no_show" : "completed") : "booked");
    if (status === "booked" || status === "completed") this.busy.set(key, [...(this.busy.get(key) ?? []), { start, end }]);
    this.seq += 1;
    const appointment: Appointment = {
      id: params.id ?? `appt-${String(this.seq).padStart(5, "0")}`,
      salonId: DEMO_SALON_ID,
      clientId: params.clientId,
      staffId: staff.id,
      serviceId: service.id,
      start: toIso(start),
      end: toIso(end),
      status,
      source: params.source,
      price: service.price,
      createdAt: toIso(params.createdAt ?? Math.min(start, this.anchor) - this.rng.int(1, 6) * 86_400_000),
    };
    this.appts.push(appointment);
    return appointment;
  }

  /** Intenta reservar; si no cabe devuelve `undefined`. */
  tryBook(params: Omit<Parameters<SeedPlanner["book"]>[0], "start"> & PlaceOptions): Appointment | undefined {
    const start = this.findStart(params.staff, params.service, params.date, params);
    return start === undefined ? undefined : this.book({ ...params, start });
  }

  /** Reemplaza una cita ya generada (para marcar fuentes de ROI en el historial). */
  replace(id: string, patch: Partial<Appointment>): void {
    const index = this.appts.findIndex((a) => a.id === id);
    const current = this.appts[index];
    if (current) this.appts[index] = { ...current, ...patch };
  }

  /** Agrega una cita que no ocupa agenda (cancelada). */
  addCancelled(appointment: Appointment): void {
    this.appts.push(appointment);
  }

  nextId(prefix: string): string {
    this.seq += 1;
    return `${prefix}-${String(this.seq).padStart(5, "0")}`;
  }

  get appointments(): readonly Appointment[] {
    return this.appts;
  }
}
