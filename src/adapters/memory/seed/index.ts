import { type LocalDate } from "@/domain/model";
import { DAY, addDaysToDate, localDateOf, startOfWeekDate, zonedInstant } from "@/domain/time";
import type { MemoryDb } from "../store";
import { DEMO_TZ, demoSalon, demoServices, demoSpecialties, demoStaff } from "./catalog";
import { fillDay, generateProfiles, generateVisits, packDay } from "./history";
import { PERSONAS } from "./people";
import { SeedPlanner } from "./planner";
import { generateRoiHistory } from "./roi-history";
import { createRng } from "./rng";
import { extraWaitlist, personaClients, personaMessages, personaWaitlist, placePersonaHistories } from "./story";

export { DEMO_SALON_ID, DEMO_TZ } from "./catalog";
export { PERSONAS, type PersonaKey } from "./people";

/** "Ahora" de la demo: jueves 10:00 de la semana en curso (hora de Santo Domingo). */
export function demoAnchor(realNow: number = Date.now()): number {
  const thursday = addDaysToDate(startOfWeekDate(localDateOf(realNow, DEMO_TZ)), 3);
  return zonedInstant(thursday, "10:00", DEMO_TZ);
}

export interface DemoSeed {
  readonly db: MemoryDb;
  readonly anchor: number;
  readonly anchorDate: LocalDate;
  readonly juanSaturdayAppointmentId: string;
}

const CLIENT_COUNT = 380;
/** Ocupación extra por día relativo al ancla (citas a intentar por estilista) para que la agenda se vea viva. */
const LIVELINESS: readonly number[] = [4, 6, 9, 3, 0, 3, 3, 4, 5, 8, 2];

/** Genera el salón de demo completo. Determinista: misma semilla → mismos datos. */
export function seedDemo(options: { anchor?: number; seed?: number } = {}): DemoSeed {
  const anchor = options.anchor ?? demoAnchor();
  const anchorDate = localDateOf(anchor, DEMO_TZ);
  const rng = createRng(options.seed ?? 20261001);
  const planner = new SeedPlanner(rng, anchor);
  const createdAt = anchor - 200 * DAY;

  const { juanSaturday } = placePersonaHistories(planner, anchorDate);
  const profiles = generateProfiles(rng, CLIENT_COUNT, anchorDate, createdAt);
  for (const profile of profiles) generateVisits(planner, rng, profile, anchorDate, 35);
  LIVELINESS.forEach((slots, offset) => {
    for (const staff of demoStaff) fillDay(planner, rng, profiles, staff, addDaysToDate(anchorDate, offset), slots);
  });
  const carlos = demoStaff.find((s) => s.id === "staff-carlos")!;
  packDay(planner, rng, profiles, carlos, addDaysToDate(anchorDate, 2));

  const regularIds = profiles.filter((p) => !p.client.optedOut).map((p) => p.client.id);
  const roi = generateRoiHistory(planner, rng, regularIds, anchor, anchorDate);

  const db: MemoryDb = {
    salon: demoSalon,
    specialties: demoSpecialties,
    staff: demoStaff,
    services: demoServices,
    clients: [...personaClients(createdAt), ...profiles.map((p) => p.client)],
    appointments: [...planner.appointments].sort((a, b) => a.start.localeCompare(b.start)),
    blocks: [],
    waitlist: [...personaWaitlist(anchor, anchorDate), ...extraWaitlist(anchor, anchorDate, regularIds)],
    gaps: roi.gaps,
    offers: roi.offers,
    nudges: roi.nudges,
    messages: personaMessages(anchor, anchorDate),
    conversations: [],
    calendarLinks: [],
    activity: [],
  };
  return { db, anchor, anchorDate, juanSaturdayAppointmentId: juanSaturday.id };
}

export const PERSONA_PHONES = Object.values(PERSONAS).map((p) => p.phone);
