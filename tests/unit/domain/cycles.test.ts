import { describe, expect, it } from "vitest";
import { analyzeCycles, classifyCycle, estimateCycle, returningThisWeek, selectNudges, visitIntervals } from "@/domain/cycles";
import type { Client, Nudge } from "@/domain/model";
import { addDaysToDate, startOfWeekDate, toIso } from "@/domain/time";
import { NOW, SALON, THURSDAY, TZ, appointment, barba, clasico, color, config, fade } from "../../fixtures/salon";

const params = config.cycles;
/** Fechas de visita hacia atrás desde `last`, con los intervalos dados (del más viejo al más nuevo). */
const history = (last: string, intervals: number[]): string[] => {
  const dates = [last];
  for (const gap of [...intervals].reverse()) dates.unshift(addDaysToDate(dates[0]!, -gap));
  return dates;
};

describe("estimateCycle", () => {
  it("cliente regular cada 3 semanas → ~21 días con confianza alta", () => {
    const est = estimateCycle(history("2026-09-20", [21, 21, 20, 22, 21, 21]), 28, params);
    expect(est.expectedDays).toBeGreaterThanOrEqual(21);
    expect(est.expectedDays).toBeLessThanOrEqual(23);
    expect(est.confidence).toBeGreaterThan(0.6);
  });

  it("cada 2 semanas (barba) aunque el servicio diga 14 → 14", () => {
    expect(estimateCycle(history("2026-09-20", [14, 14, 15, 13, 14]), 14, params).expectedDays).toBe(14);
  });

  it("cada 4 semanas", () => {
    const est = estimateCycle(history("2026-09-20", [28, 27, 29, 28]), 21, params);
    expect(est.expectedDays).toBeGreaterThanOrEqual(26);
    expect(est.expectedDays).toBeLessThanOrEqual(28);
  });

  it("ignora vacaciones (intervalo atípico)", () => {
    const withVacation = estimateCycle(history("2026-09-20", [21, 21, 70, 21, 21]), 28, params);
    expect(withVacation.intervals).not.toContain(70);
    expect(withVacation.expectedDays).toBeLessThanOrEqual(23);
  });

  it("pondera lo reciente: un cliente que pasó de 4 a 2 semanas", () => {
    const est = estimateCycle(history("2026-09-20", [28, 28, 28, 14, 14, 14, 14]), 28, params);
    expect(est.expectedDays).toBeLessThan(20);
  });

  it("cliente nuevo (una visita) → ciclo del servicio con confianza baja", () => {
    const est = estimateCycle(["2026-09-20"], 28, params);
    expect(est).toMatchObject({ expectedDays: 28, source: "default" });
    expect(est.confidence).toBeLessThan(0.3);
  });

  it("dos visitas → encoge hacia el default", () => {
    const est = estimateCycle(history("2026-09-20", [14]), 28, params);
    expect(est.expectedDays).toBeGreaterThan(14);
    expect(est.expectedDays).toBeLessThan(28);
  });

  it("irregular → confianza menor que regular", () => {
    const irregular = estimateCycle(history("2026-09-20", [10, 35, 18, 40, 15]), 28, params);
    const regular = estimateCycle(history("2026-09-20", [21, 21, 21, 21, 21]), 28, params);
    expect(irregular.confidence).toBeLessThan(regular.confidence);
  });

  it("descarta retoques de la misma semana", () => {
    expect(visitIntervals(["2026-09-01", "2026-09-03", "2026-09-22"], params.minIntervalDays)).toEqual([19]);
  });
});

describe("classifyCycle", () => {
  const c = (last: string, today: string, booked = false) => classifyCycle(last, 28, today, booked, params).status;
  it("estados en el tiempo", () => {
    expect(c("2026-09-01", "2026-09-15")).toBe("ok");
    expect(c("2026-09-01", "2026-09-27")).toBe("due");
    expect(c("2026-09-01", "2026-10-03")).toBe("due");
    expect(c("2026-09-01", "2026-10-10")).toBe("overdue");
    expect(c("2026-09-01", "2026-11-05")).toBe("at_risk");
    expect(c("2026-09-01", "2026-10-10", true)).toBe("booked");
  });
});

describe("analyzeCycles", () => {
  const visits = (clientId: string, dates: string[], staffId = "carlos", serviceId = "fade") =>
    dates.map((d) => appointment(staffId, d, "10:00", 45, { clientId, serviceId, status: "completed" }));
  const services = [fade, clasico, barba, color];
  const run = (appointments: ReturnType<typeof visits>) =>
    analyzeCycles({ appointments, services, timezone: TZ, today: THURSDAY, now: NOW, params });

  it("calcula un ciclo por cliente y categoría, con servicio y estilista habituales", () => {
    const appts = [
      ...visits("pedro", history("2026-09-03", [28, 28, 28])),
      ...visits("pedro", history("2026-09-24", [14, 14, 14]), "miguel", "barba"),
    ];
    const cycles = run(appts);
    expect(cycles).toHaveLength(2);
    const corte = cycles.find((c) => c.category === "corte")!;
    expect(corte).toMatchObject({ clientId: "pedro", usualServiceId: "fade", usualStaffId: "carlos", visits: 4, status: "due" });
    const barbaCycle = cycles.find((c) => c.category === "barba")!;
    expect(barbaCycle.usualStaffId).toBe("miguel");
  });

  it("un fade y un corte clásico cuentan como la misma categoría", () => {
    const appts = [
      ...visits("ana", ["2026-07-01", "2026-07-29"], "carlos", "fade"),
      ...visits("ana", ["2026-08-26"], "carlos", "clasico"),
    ];
    expect(run(appts)).toHaveLength(1);
  });

  it("una cita futura marca al cliente como 'booked'", () => {
    const appts = [
      ...visits("pedro", history("2026-09-03", [28, 28])),
      appointment("carlos", "2026-10-03", "10:00", 45, { clientId: "pedro", serviceId: "fade", status: "booked" }),
    ];
    expect(run(appts)[0]!.status).toBe("booked");
  });

  it("el panel 'por volver' excluye a los que ya reservaron y ordena por urgencia", () => {
    const appts = [
      ...visits("due", history("2026-09-04", [28, 28])),
      ...visits("late", history("2026-08-20", [28, 28])),
      ...visits("fine", history("2026-09-25", [28, 28])),
    ];
    const panel = returningThisWeek(run(appts), startOfWeekDate(THURSDAY));
    expect(panel.map((c) => c.clientId)).toEqual(["late", "due"]);
  });
});

describe("selectNudges", () => {
  const client = (id: string, optedOut = false): Client => ({
    id,
    salonId: SALON,
    name: id,
    phone: "+18095550000",
    optedOut,
    createdAt: toIso(NOW),
  });
  const cycles = analyzeCycles({
    appointments: ["pedro", "ana", "luisa"].flatMap((id) =>
      history("2026-09-03", [28, 28]).map((d) => appointment("carlos", d, "10:00", 45, { clientId: id, status: "completed" })),
    ),
    services: [fade],
    timezone: TZ,
    today: THURSDAY,
    now: NOW,
    params,
  });
  const base = { cycles, today: THURSDAY, timezone: TZ, leadDays: 1, renudgeAfterDays: 10, maxPerRun: 50 };

  it("invita a quien le toca y respeta la baja", () => {
    const picked = selectNudges({ ...base, clients: [client("pedro"), client("ana", true), client("luisa")], nudges: [] });
    expect(picked.map((c) => c.clientId).sort()).toEqual(["luisa", "pedro"]);
  });

  it("no repite la invitación en el mismo ciclo antes de tiempo", () => {
    const pedro = cycles.find((c) => c.clientId === "pedro")!;
    const nudge: Nudge = {
      id: "n1",
      salonId: SALON,
      clientId: "pedro",
      category: "corte",
      serviceId: "fade",
      dueDate: pedro.dueDate,
      lastVisitAppointmentId: pedro.lastVisitAppointmentId,
      status: "sent",
      sentAt: toIso(NOW - 2 * 86_400_000),
    };
    const picked = selectNudges({ ...base, clients: [client("pedro")], nudges: [nudge] });
    expect(picked).toHaveLength(0);
    const later = selectNudges({ ...base, today: "2026-10-12", clients: [client("pedro")], nudges: [nudge] });
    expect(later).toHaveLength(1);
    const declined = selectNudges({ ...base, today: "2026-10-12", clients: [client("pedro")], nudges: [{ ...nudge, status: "declined" }] });
    expect(declined).toHaveLength(0);
  });
});
