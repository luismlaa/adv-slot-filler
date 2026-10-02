import type { Salon, Service, Specialty, Staff, TimeRange, WeeklySchedule } from "@/domain/model";

export const DEMO_SALON_ID = "salon-el-clasico";
export const DEMO_TZ = "America/Santo_Domingo";

export const demoSalon: Salon = {
  id: DEMO_SALON_ID,
  name: "Barbería El Clásico",
  timezone: DEMO_TZ,
  currency: "DOP",
  phone: "+18095550100",
  address: "Av. Abraham Lincoln 1003, Piantini, Santo Domingo",
  settings: {},
};

export const demoSpecialties: Specialty[] = [
  { id: "fade", name: "Fade / degradado" },
  { id: "clasico", name: "Corte clásico" },
  { id: "barba", name: "Barba" },
  { id: "color", name: "Color / tinte" },
  { id: "ninos", name: "Niños" },
];

const day = (...ranges: [string, string][]): TimeRange[] => ranges.map(([start, end]) => ({ start, end }));
/** domingo … sábado */
const week = (sun: TimeRange[], weekday: TimeRange[], sat: TimeRange[], off: number[] = []): WeeklySchedule =>
  [sun, weekday, weekday, weekday, weekday, weekday, sat].map((ranges, i) => (i === 1 || off.includes(i) ? [] : ranges));

const lunchAt13 = day(["09:00", "13:00"], ["14:00", "19:00"]);
const lunchAt12 = day(["09:00", "12:00"], ["13:00", "19:00"]);
const sunday = day(["09:00", "14:00"]);
const saturday = day(["08:00", "13:00"], ["14:00", "19:00"]);

const staff = (
  id: string,
  name: string,
  aliases: string[],
  specialties: string[],
  schedule: WeeklySchedule,
  color: string,
): Staff => ({ id, salonId: DEMO_SALON_ID, name, aliases, specialties, schedule, color, active: true });

/** Los lunes la barbería cierra (día 1 vacío en todos los horarios). */
export const demoStaff: Staff[] = [
  staff("staff-carlos", "Carlos Peña", ["carlitos"], ["fade", "clasico", "barba"], week(sunday, lunchAt13, saturday), "#2563eb"),
  staff("staff-luis", "Luis Rodríguez", ["lucho", "luisito"], ["fade", "ninos"], week([], lunchAt12, saturday), "#059669"),
  staff("staff-miguel", "Miguel Santos", ["miguelito", "mike"], ["barba", "clasico"], week(sunday, lunchAt13, saturday, [2]), "#d97706"),
  staff("staff-rafa", "Rafael Jiménez", ["rafa", "rafi"], ["fade", "barba"], week([], lunchAt12, saturday, [3]), "#7c3aed"),
  staff("staff-andrea", "Andrea Castillo", ["andre"], ["color", "clasico", "ninos"], week([], lunchAt13, saturday), "#db2777"),
];

const service = (
  id: string,
  name: string,
  category: Service["category"],
  durationMinutes: number,
  price: number,
  requiredSpecialties: string[],
  defaultCycleDays: number,
  keywords: string[],
): Service => ({
  id,
  salonId: DEMO_SALON_ID,
  name,
  category,
  durationMinutes,
  bufferMinutes: 0,
  price,
  requiredSpecialties,
  defaultCycleDays,
  keywords,
  active: true,
});

export const demoServices: Service[] = [
  service("svc-fade", "Fade / degradado", "corte", 45, 700, ["fade"], 21, ["fade", "degradado", "desvanecido", "taper", "low fade", "mid fade", "high fade"]),
  service("svc-clasico", "Corte clásico", "corte", 30, 500, ["clasico"], 28, ["corte", "recorte", "pelarme", "pelada", "pelado", "cortarme el pelo", "cortar el pelo", "cortarme"]),
  service("svc-combo", "Corte + barba", "corte", 60, 1000, ["clasico", "barba"], 21, ["corte y barba", "pelo y barba", "combo", "corte con barba"]),
  service("svc-barba", "Arreglo de barba", "barba", 30, 400, ["barba"], 14, ["barba", "perfilado", "perfilar", "afeitar", "afeitada", "rasurar"]),
  service("svc-nino", "Corte de niño", "corte", 30, 400, ["ninos"], 30, ["niño", "nino", "niña", "nina", "mi hijo", "mi hija", "el niño", "el chamaco", "chiquito"]),
  service("svc-color", "Color / tinte", "color", 90, 1800, ["color"], 42, ["color", "tinte", "teñir", "tenir", "mechas", "rayitos", "pintarme el pelo", "canas"]),
];

export const serviceById = (id: string): Service => {
  const found = demoServices.find((s) => s.id === id);
  if (!found) throw new Error(`Servicio de demo desconocido: ${id}`);
  return found;
};
