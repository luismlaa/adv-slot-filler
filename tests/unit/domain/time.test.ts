import { describe, expect, it } from "vitest";
import {
  addDaysToDate,
  candidateStarts,
  daysBetweenDates,
  freeIntervals,
  isSlotFree,
  localParts,
  mergeIntervals,
  startOfWeekDate,
  subtractIntervals,
  utilization,
  zonedInstant,
} from "@/domain/time";
import { NOW, SATURDAY, THURSDAY, TZ, appointment, carlos, config, fade, fillDay, miguel, snapshot } from "../../fixtures/salon";

describe("zona horaria", () => {
  it("Santo Domingo es UTC-4", () => {
    expect(new Date(zonedInstant("2026-10-03", "10:00", TZ)).toISOString()).toBe("2026-10-03T14:00:00.000Z");
  });

  it("descompone un instante en partes locales", () => {
    expect(localParts(NOW, TZ)).toEqual({ date: THURSDAY, time: "10:00", weekday: 4, minutesOfDay: 600 });
  });

  it("aritmética de fechas locales cruza meses", () => {
    expect(addDaysToDate("2026-10-30", 3)).toBe("2026-11-02");
    expect(daysBetweenDates("2026-09-28", "2026-10-03")).toBe(5);
    expect(startOfWeekDate(SATURDAY)).toBe("2026-09-28");
    expect(startOfWeekDate("2026-10-04")).toBe("2026-09-28");
  });
});

describe("intervalos", () => {
  it("fusiona solapados y contiguos", () => {
    expect(mergeIntervals([{ start: 5, end: 8 }, { start: 0, end: 3 }, { start: 3, end: 5 }])).toEqual([{ start: 0, end: 8 }]);
  });

  it("resta ocupados de libres", () => {
    expect(subtractIntervals([{ start: 0, end: 10 }], [{ start: 2, end: 4 }, { start: 8, end: 12 }])).toEqual([
      { start: 0, end: 2 },
      { start: 4, end: 8 },
    ]);
  });
});

describe("disponibilidad", () => {
  it("excluye el almuerzo y respeta la grilla de 15 minutos", () => {
    const starts = candidateStarts(carlos, fade, SATURDAY, snapshot(), NOW, config.slots);
    const times = starts.map((s) => localParts(s, TZ).time);
    expect(times[0]).toBe("09:00");
    expect(times).toContain("12:15");
    expect(times).not.toContain("12:30");
    expect(times).toContain("14:00");
    expect(times.at(-1)).toBe("18:15");
    expect(times.every((t) => Number(t.slice(3)) % 15 === 0)).toBe(true);
  });

  it("no ofrece horas pasadas ni dentro de la antelación mínima", () => {
    const times = candidateStarts(carlos, fade, THURSDAY, snapshot(), NOW, config.slots).map((s) => localParts(s, TZ).time);
    expect(times[0]).toBe("10:30");
  });

  it("los estilistas no trabajan en su día libre", () => {
    expect(freeIntervals(miguel, SATURDAY, snapshot(), NOW, config.slots)).toEqual([]);
  });

  it("detecta choques con citas y bloqueos", () => {
    const appt = appointment("carlos", SATURDAY, "10:00", 45);
    const snap = snapshot({ appointments: [appt] });
    const at = (time: string, minutes: number) => ({
      start: zonedInstant(SATURDAY, time, TZ),
      end: zonedInstant(SATURDAY, time, TZ) + minutes * 60_000,
    });
    expect(isSlotFree(carlos, at("10:30", 30), snap)).toBe(false);
    expect(isSlotFree(carlos, at("10:45", 30), snap)).toBe(true);
    expect(isSlotFree(carlos, at("12:45", 30), snap)).toBe(false);
    expect(isSlotFree(carlos, at("10:30", 30), snap, appt.id)).toBe(true);
  });

  it("ignora citas canceladas", () => {
    const cancelled = appointment("carlos", SATURDAY, "10:00", 45, { status: "cancelled" });
    const starts = candidateStarts(carlos, fade, SATURDAY, snapshot({ appointments: [cancelled] }), NOW, config.slots);
    expect(starts).toContain(zonedInstant(SATURDAY, "10:00", TZ));
  });

  it("calcula la utilización del día", () => {
    expect(utilization(carlos, SATURDAY, snapshot())).toBe(0);
    expect(utilization(carlos, SATURDAY, snapshot({ appointments: fillDay("carlos", SATURDAY) }))).toBe(1);
  });
});
