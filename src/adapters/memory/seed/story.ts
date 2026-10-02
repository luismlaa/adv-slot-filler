import type { Appointment, Client, LocalDate, Message, WaitlistEntry } from "@/domain/model";
import { HOUR, addDaysToDate, toIso, zonedInstant } from "@/domain/time";
import { DEMO_SALON_ID, DEMO_TZ, demoStaff, serviceById } from "./catalog";
import { PERSONAS, type PersonaKey } from "./people";
import type { SeedPlanner } from "./planner";

const staff = (id: string) => {
  const found = demoStaff.find((s) => s.id === id);
  if (!found) throw new Error(`Estilista de demo desconocido: ${id}`);
  return found;
};

interface PersonaHistory {
  readonly key: PersonaKey;
  readonly staffId: string;
  readonly serviceId: string;
  readonly daysSinceLast: number;
  /** Intervalos previos, del más antiguo al más reciente. */
  readonly intervals: readonly number[];
  readonly time: string;
}

/** Historias fijas: Pedro (cada 4 semanas con Carlos), José (lista de espera), Ana (color), Juan (cancela el sábado). */
const HISTORIES: readonly PersonaHistory[] = [
  { key: "pedro", staffId: "staff-carlos", serviceId: "svc-fade", daysSinceLast: 26, intervals: [28, 27, 29, 28, 28, 28, 27], time: "16:00" },
  { key: "jose", staffId: "staff-carlos", serviceId: "svc-fade", daysSinceLast: 24, intervals: [21, 20, 22, 21, 21], time: "17:00" },
  { key: "ana", staffId: "staff-andrea", serviceId: "svc-color", daysSinceLast: 40, intervals: [42, 41, 43], time: "10:00" },
  { key: "juan", staffId: "staff-carlos", serviceId: "svc-fade", daysSinceLast: 19, intervals: [21, 22, 20, 21], time: "11:00" },
];

export function personaClients(createdAt: number): Client[] {
  return (Object.keys(PERSONAS) as PersonaKey[]).map((key) => ({
    id: PERSONAS[key].id,
    salonId: DEMO_SALON_ID,
    name: PERSONAS[key].name,
    phone: PERSONAS[key].phone,
    preferredStaffId: HISTORIES.find((h) => h.key === key)?.staffId,
    optedOut: false,
    createdAt: toIso(createdAt),
  }));
}

/** Coloca el historial de cada personaje (exacto, corriéndose un día si hace falta) y la cita de Juan del sábado. */
export function placePersonaHistories(planner: SeedPlanner, anchorDate: LocalDate): { juanSaturday: Appointment } {
  for (const h of HISTORIES) {
    let date = addDaysToDate(anchorDate, -h.daysSinceLast);
    const dates = [date];
    for (const gap of [...h.intervals].reverse()) {
      date = addDaysToDate(date, -gap);
      dates.unshift(date);
    }
    for (const d of dates) {
      for (const candidate of [d, addDaysToDate(d, 1), addDaysToDate(d, -1)]) {
        const appt = planner.tryBook({
          staff: staff(h.staffId),
          service: serviceById(h.serviceId),
          date: candidate,
          clientId: PERSONAS[h.key].id,
          source: "whatsapp",
          preferMinutes: Number(h.time.slice(0, 2)) * 60,
          status: "completed",
        });
        if (appt) break;
      }
    }
  }
  const saturday = addDaysToDate(anchorDate, 2);
  const juanSaturday = planner.tryBook({
    staff: staff("staff-carlos"),
    service: serviceById("svc-fade"),
    date: saturday,
    clientId: PERSONAS.juan.id,
    source: "whatsapp",
    exact: "16:00",
    status: "booked",
  });
  if (!juanSaturday) throw new Error("No se pudo colocar la cita de Juan del sábado");
  return { juanSaturday };
}

export function personaWaitlist(anchor: number, anchorDate: LocalDate): WaitlistEntry[] {
  const saturday = addDaysToDate(anchorDate, 2);
  return [
    {
      id: "wait-jose",
      salonId: DEMO_SALON_ID,
      clientId: PERSONAS.jose.id,
      serviceId: "svc-fade",
      staffIds: ["staff-carlos"],
      windowStart: toIso(zonedInstant(saturday, "14:00", DEMO_TZ)),
      windowEnd: toIso(zonedInstant(saturday, "19:00", DEMO_TZ)),
      status: "active",
      createdAt: toIso(anchor - 22 * HOUR),
    },
  ];
}

export function extraWaitlist(anchor: number, anchorDate: LocalDate, clientIds: readonly string[]): WaitlistEntry[] {
  const at = (offsetDays: number, time: string) => toIso(zonedInstant(addDaysToDate(anchorDate, offsetDays), time, DEMO_TZ));
  const entry = (i: number, serviceId: string, staffIds: string[], from: string, to: string): WaitlistEntry => ({
    id: `wait-${i}`,
    salonId: DEMO_SALON_ID,
    clientId: clientIds[i % clientIds.length]!,
    serviceId,
    staffIds,
    windowStart: from,
    windowEnd: to,
    status: "active",
    createdAt: toIso(anchor - (i + 1) * 9 * HOUR),
  });
  return [
    entry(0, "svc-barba", [], at(1, "09:00"), at(1, "13:00")),
    entry(1, "svc-fade", [], at(2, "08:00"), at(2, "12:00")),
    entry(2, "svc-color", ["staff-andrea"], at(5, "09:00"), at(6, "19:00")),
    entry(3, "svc-clasico", ["staff-miguel", "staff-carlos"], at(3, "09:00"), at(3, "14:00")),
  ];
}

/** Conversaciones previas para que el teléfono de la demo no arranque vacío. */
export function personaMessages(anchor: number, anchorDate: LocalDate): Message[] {
  const pedroDay = addDaysToDate(anchorDate, -26);
  const at = (date: LocalDate, time: string) => toIso(zonedInstant(date, time, DEMO_TZ));
  const msg = (phone: string, clientId: string, direction: "in" | "out", text: string, when: string, i: number): Message => ({
    id: `msg-seed-${clientId}-${i}`,
    salonId: DEMO_SALON_ID,
    phone,
    clientId,
    direction,
    text,
    purpose: direction === "out" ? "reply" : "reply",
    at: when,
  });
  const p = PERSONAS.pedro;
  const j = PERSONAS.jose;
  return [
    msg(p.phone, p.id, "in", "Klk, ¿Carlos tiene espacio hoy en la tarde?", at(pedroDay, "11:02"), 1),
    msg(p.phone, p.id, "out", "¡Hola Pedro! 👋 Carlos tiene libre hoy a las 4:00 p. m. para tu fade. ¿Te lo aparto?", at(pedroDay, "11:02"), 2),
    msg(p.phone, p.id, "in", "Dale", at(pedroDay, "11:04"), 3),
    msg(p.phone, p.id, "out", "Listo ✅ Fade con Carlos hoy a las 4:00 p. m. Te esperamos en Barbería El Clásico.", at(pedroDay, "11:04"), 4),
    msg(j.phone, j.id, "in", "Saludos, ¿hay algo el sábado en la tarde con Carlos?", toIso(anchor - 23 * HOUR), 1),
    msg(j.phone, j.id, "out", "Hola José. Carlos está lleno el sábado en la tarde 😕 ¿Quieres que te avise si se libera un espacio?", toIso(anchor - 23 * HOUR + 30_000), 2),
    msg(j.phone, j.id, "in", "Sí, porfa", toIso(anchor - 22 * HOUR), 3),
    msg(j.phone, j.id, "out", "Listo José, quedaste en lista de espera para el sábado de 2:00 a 7:00 p. m. con Carlos. Te escribo apenas se libere algo.", toIso(anchor - 22 * HOUR + 30_000), 4),
  ];
}
