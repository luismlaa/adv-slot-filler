import { type Client, type LocalDate, type Service, type Staff, staffCanPerform } from "@/domain/model";
import { addDaysToDate, toIso, weekdayOfDate } from "@/domain/time";
import { DEMO_SALON_ID, demoServices, demoStaff, serviceById } from "./catalog";
import { FEMALE_NAMES, LAST_NAMES, MALE_NAMES } from "./people";
import type { SeedPlanner } from "./planner";
import type { Rng } from "./rng";

export interface ClientProfile {
  readonly client: Client;
  readonly service: Service;
  readonly cycleDays: number;
  readonly loyalStaff?: Staff;
  readonly preferMinutes: number;
  readonly noise: number;
  /** Dejó de venir: su último corte fue hace más de 2 ciclos. */
  readonly churnAfter?: LocalDate;
  /** Además del corte, va por barba en su propio ciclo. */
  readonly beard?: { readonly cycleDays: number; readonly staff?: Staff };
}

const eligibleFor = (service: Service) => demoStaff.filter((s) => staffCanPerform(s, service));

const SOURCES = ["whatsapp", "whatsapp", "whatsapp", "salon", "salon", "walkin"] as const;

export function generateProfiles(rng: Rng, count: number, anchorDate: LocalDate, createdAt: number): ClientProfile[] {
  const usedNames = new Set<string>();
  const profiles: ClientProfile[] = [];
  for (let i = 0; i < count; i += 1) {
    const female = i >= Math.round(count * 0.8);
    let name: string;
    do {
      name = `${rng.pick(female ? FEMALE_NAMES : MALE_NAMES)} ${rng.pick(LAST_NAMES)}`;
    } while (usedNames.has(name));
    usedNames.add(name);

    const roll = rng.next();
    const serviceId = female
      ? roll < 0.55 ? "svc-color" : roll < 0.9 ? "svc-clasico" : "svc-nino"
      : roll < 0.4 ? "svc-fade" : roll < 0.65 ? "svc-clasico" : roll < 0.85 ? "svc-combo" : "svc-nino";
    const service = serviceById(serviceId);
    const eligible = female && serviceId === "svc-clasico" ? demoStaff.filter((s) => s.id === "staff-andrea") : eligibleFor(service);
    const cycleDays = Math.max(10, Math.round(rng.normal(service.defaultCycleDays, service.defaultCycleDays * 0.18)));
    const loyalStaff = rng.chance(0.75) ? rng.pick(eligible) : undefined;
    const churned = rng.chance(0.1);
    const wantsBeard = !female && serviceId !== "svc-combo" && serviceId !== "svc-nino" && rng.chance(0.25);
    const beardStaff = eligibleFor(serviceById("svc-barba"));

    profiles.push({
      client: {
        id: `client-${String(i + 1).padStart(3, "0")}`,
        salonId: DEMO_SALON_ID,
        name,
        phone: `+1${rng.pick(["809", "829", "849"])}555${String(1000 + i).padStart(4, "0")}`,
        preferredStaffId: loyalStaff?.id,
        optedOut: rng.chance(0.03),
        createdAt: toIso(createdAt),
      },
      service,
      cycleDays,
      loyalStaff,
      preferMinutes: rng.pick([9, 10, 11, 12, 15, 16, 17, 18]) * 60,
      noise: rng.chance(0.2) ? 0.3 : 0.08,
      churnAfter: churned ? addDaysToDate(anchorDate, -Math.round(cycleDays * (2.2 + rng.next() * 1.3))) : undefined,
      beard: wantsBeard ? { cycleDays: Math.max(8, Math.round(rng.normal(14, 3))), staff: rng.pick(beardStaff) } : undefined,
    });
  }
  return profiles;
}

/** Reserva una visita cerca de `date`, corriéndose hasta 3 días si ese día no hay espacio. */
function placeVisit(
  planner: SeedPlanner,
  rng: Rng,
  profile: ClientProfile,
  service: Service,
  date: LocalDate,
  staffPool: readonly Staff[],
  loyal: Staff | undefined,
) {
  for (let shift = 0; shift < 4; shift += 1) {
    const day = addDaysToDate(date, shift);
    if (weekdayOfDate(day) === 1) continue;
    const staff = loyal && rng.chance(0.92) ? loyal : rng.pick(staffPool);
    const appt = planner.tryBook({
      staff,
      service,
      date: day,
      clientId: profile.client.id,
      source: rng.pick(SOURCES),
      preferMinutes: profile.preferMinutes,
    });
    if (appt) return { appt, date: day };
  }
  return undefined;
}

/** Genera el historial (≈6 meses) y las próximas citas ya reservadas de un perfil. */
export function generateVisits(
  planner: SeedPlanner,
  rng: Rng,
  profile: ClientProfile,
  anchorDate: LocalDate,
  horizonDays: number,
): void {
  const tracks = [
    { service: profile.service, cycle: profile.cycleDays, loyal: profile.loyalStaff, pool: profile.loyalStaff ? [profile.loyalStaff] : eligibleFor(profile.service) },
    ...(profile.beard
      ? [{ service: serviceById("svc-barba"), cycle: profile.beard.cycleDays, loyal: profile.beard.staff, pool: eligibleFor(serviceById("svc-barba")) }]
      : []),
  ];

  for (const track of tracks) {
    const pool = track.pool.length > 0 ? track.pool : eligibleFor(track.service);
    let date = addDaysToDate(anchorDate, -180 + rng.int(0, track.cycle));
    let last: LocalDate | undefined;
    while (date < anchorDate) {
      if (profile.churnAfter !== undefined && date > profile.churnAfter) break;
      const placed = placeVisit(planner, rng, profile, track.service, date, pool, track.loyal);
      if (placed && placed.date < anchorDate) last = placed.date;
      const jitter = Math.round(track.cycle * rng.normal(0, profile.noise));
      date = addDaysToDate(placed?.date ?? date, Math.max(5, track.cycle + jitter) + (rng.chance(0.05) ? track.cycle : 0));
    }
    if (last === undefined || profile.churnAfter !== undefined) continue;

    // Próximas citas: solo si el siguiente ciclo cae en el futuro; los vencidos quedan "por volver".
    let next = addDaysToDate(last, track.cycle);
    let probability = 0.55;
    while (next >= anchorDate && next <= addDaysToDate(anchorDate, horizonDays) && rng.chance(probability)) {
      const placed = placeVisit(planner, rng, profile, track.service, next, pool, track.loyal);
      if (!placed) break;
      next = addDaysToDate(placed.date, track.cycle);
      probability = 0.4;
    }
  }
}

/** Sube la ocupación de un día hasta `target` con reservas de clientes al azar (agenda viva para la demo). */
export function fillDay(
  planner: SeedPlanner,
  rng: Rng,
  profiles: readonly ClientProfile[],
  staff: Staff,
  date: LocalDate,
  slots: number,
): void {
  const candidates = profiles.filter((p) => p.churnAfter === undefined && staffCanPerform(staff, p.service));
  for (let i = 0; i < slots && candidates.length > 0; i += 1) {
    const profile = rng.pick(candidates);
    planner.tryBook({ staff, service: profile.service, date, clientId: profile.client.id, source: rng.pick(SOURCES) });
  }
}

/** Llena por completo el día de un estilista (el "Carlos está lleno el sábado" del guion). */
export function packDay(planner: SeedPlanner, rng: Rng, profiles: readonly ClientProfile[], staff: Staff, date: LocalDate): void {
  const bySize = [...demoServices].filter((s) => staffCanPerform(staff, s)).sort((a, b) => b.durationMinutes - a.durationMinutes);
  const regulars = profiles.filter((p) => p.churnAfter === undefined);
  for (const service of bySize) {
    for (let guard = 0; guard < 40; guard += 1) {
      const start = planner.findStart(staff, service, date, { preferMinutes: 8 * 60 });
      if (start === undefined) break;
      planner.book({ staff, service, date, start, clientId: rng.pick(regulars).client.id, source: rng.pick(SOURCES) });
    }
  }
}
