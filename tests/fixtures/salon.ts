import { defaultBusinessConfig } from "@/config/business";
import type { Appointment, Block, Service, Staff, WeeklySchedule } from "@/domain/model";
import { type ScheduleSnapshot, toIso, zonedInstant } from "@/domain/time";

export const TZ = "America/Santo_Domingo";
export const SALON = "salon-test";
/** Jueves 2026-10-01 10:00 hora de Santo Domingo. */
export const NOW = zonedInstant("2026-10-01", "10:00", TZ);
export const THURSDAY = "2026-10-01";
export const FRIDAY = "2026-10-02";
export const SATURDAY = "2026-10-03";
export const config = defaultBusinessConfig;

const workday = [
  { start: "09:00", end: "13:00" },
  { start: "14:00", end: "19:00" },
];
/** Martes a sábado, almuerzo 13–14. */
export const tueToSat: WeeklySchedule = [[], [], workday, workday, workday, workday, workday];
export const tueToFri: WeeklySchedule = [[], [], workday, workday, workday, workday, []];

export const staffMember = (id: string, specialties: string[], schedule: WeeklySchedule = tueToSat): Staff => ({
  id,
  salonId: SALON,
  name: id[0]!.toUpperCase() + id.slice(1),
  aliases: [],
  specialties,
  schedule,
  color: "#336699",
  active: true,
});

export const service = (id: string, minutes: number, specialties: string[], extra: Partial<Service> = {}): Service => ({
  id,
  salonId: SALON,
  name: id,
  category: "corte",
  durationMinutes: minutes,
  bufferMinutes: 0,
  price: 500,
  requiredSpecialties: specialties,
  defaultCycleDays: 28,
  keywords: [],
  active: true,
  ...extra,
});

export const carlos = staffMember("carlos", ["fade", "clasico"]);
export const luis = staffMember("luis", ["fade", "ninos"]);
export const miguel = staffMember("miguel", ["barba", "clasico"], tueToFri);

export const fade = service("fade", 45, ["fade"]);
export const clasico = service("clasico", 30, ["clasico"]);
export const barba = service("barba", 30, ["barba"], { category: "barba", defaultCycleDays: 14 });
export const color = service("color", 90, ["color"], { category: "color", defaultCycleDays: 42 });

let seq = 0;
export function appointment(staffId: string, date: string, time: string, minutes: number, extra: Partial<Appointment> = {}): Appointment {
  const start = zonedInstant(date, time, TZ);
  seq += 1;
  return {
    id: `appt-${seq}`,
    salonId: SALON,
    clientId: extra.clientId ?? `client-${seq}`,
    staffId,
    serviceId: "fade",
    start: toIso(start),
    end: toIso(start + minutes * 60_000),
    status: "booked",
    source: "salon",
    price: 500,
    createdAt: toIso(NOW - 86_400_000),
    ...extra,
  };
}

/** Llena por completo el día de un estilista con citas consecutivas. */
export function fillDay(staffId: string, date: string, minutes = 60): Appointment[] {
  const ranges: [string, string][] = [
    ["09:00", "13:00"],
    ["14:00", "19:00"],
  ];
  return ranges.flatMap(([from, to]) => {
    const out: Appointment[] = [];
    for (let t = zonedInstant(date, from, TZ); t < zonedInstant(date, to, TZ); t += minutes * 60_000) {
      const local = new Date(t - 4 * 3_600_000).toISOString().slice(11, 16);
      out.push(appointment(staffId, date, local, Math.min(minutes, (zonedInstant(date, to, TZ) - t) / 60_000)));
    }
    return out;
  });
}

export function snapshot(parts: Partial<ScheduleSnapshot> = {}): ScheduleSnapshot {
  return {
    timezone: TZ,
    staff: [carlos, luis, miguel],
    services: [fade, clasico, barba, color],
    appointments: [],
    blocks: [] as Block[],
    ...parts,
  };
}
