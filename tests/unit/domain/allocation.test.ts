import { describe, expect, it } from "vitest";
import { allocate } from "@/domain/allocation";
import { localParts, zonedInstant } from "@/domain/time";
import { FRIDAY, NOW, SATURDAY, TZ, appointment, config, fillDay, snapshot } from "../../fixtures/salon";

const ctx = (parts: Parameters<typeof snapshot>[0] = {}) => ({ snapshot: snapshot(parts), now: NOW, config });
const local = (iso: string) => localParts(Date.parse(iso), TZ);

describe("allocate — hay espacio", () => {
  it("'fade con Carlos el sábado' devuelve horas de Carlos ese día, separadas entre sí", () => {
    const result = allocate({ serviceId: "fade", staffId: "carlos", date: SATURDAY }, ctx());
    expect(result.status).toBe("available");
    expect(result.matches).toHaveLength(3);
    expect(result.matches.every((m) => m.staffId === "carlos" && local(m.start).date === SATURDAY)).toBe(true);
    const starts = result.matches.map((m) => Date.parse(m.start)).sort();
    for (let i = 1; i < starts.length; i++) expect(starts[i]! - starts[i - 1]!).toBeGreaterThanOrEqual(3_600_000);
  });

  it("respeta la franja pedida", () => {
    const result = allocate({ serviceId: "fade", staffId: "carlos", date: SATURDAY, window: { from: "14:00", to: "18:00" } }, ctx());
    expect(result.status).toBe("available");
    for (const m of result.matches) {
      expect(local(m.start).time >= "14:00" && local(m.start).time < "18:00").toBe(true);
    }
  });

  it("hora exacta libre → una sola opción, a esa hora", () => {
    const result = allocate({ serviceId: "fade", staffId: "carlos", date: SATURDAY, time: "15:00" }, ctx());
    expect(result.status).toBe("available");
    expect(result.matches).toHaveLength(1);
    expect(local(result.matches[0]!.start).time).toBe("15:00");
  });

  it("sin estilista pedido, balancea la carga hacia el menos ocupado", () => {
    const busyLuis = [
      appointment("luis", SATURDAY, "09:00", 120),
      appointment("luis", SATURDAY, "11:00", 120),
      appointment("luis", SATURDAY, "14:00", 180),
    ];
    const result = allocate({ serviceId: "fade", date: SATURDAY, time: "17:00" }, ctx({ appointments: busyLuis }));
    expect(result.status).toBe("available");
    expect(result.matches[0]!.staffId).toBe("carlos");
  });

  it("sin estilista pedido, prefiere al habitual del cliente", () => {
    const result = allocate({ serviceId: "fade", date: SATURDAY, time: "15:00", preferredStaffId: "luis" }, ctx());
    expect(result.matches[0]!.staffId).toBe("luis");
  });

  it("si el estilista pedido no hace el servicio, ofrece a quien sí lo hace", () => {
    const result = allocate({ serviceId: "fade", staffId: "miguel", date: FRIDAY }, ctx());
    expect(result.status).toBe("available");
    expect(result.reason).toBe("staff_lacks_specialty");
    expect(result.matches.every((m) => m.staffId === "carlos" || m.staffId === "luis")).toBe(true);
  });

  it("prefiere pegar la cita a otra antes que dejar huecos inútiles", () => {
    const appts = [appointment("carlos", SATURDAY, "09:00", 60), appointment("carlos", SATURDAY, "11:00", 60)];
    const result = allocate(
      { serviceId: "clasico", staffId: "carlos", date: SATURDAY, window: { from: "10:00", to: "11:00" } },
      ctx({ appointments: appts }),
    );
    const times = result.matches.map((m) => local(m.start).time);
    expect(["10:00", "10:30"]).toContain(times[0]);
    expect(times).not.toContain("10:15");
  });
});

describe("allocate — está lleno", () => {
  const fullCarlos = fillDay("carlos", SATURDAY);

  it("Carlos lleno el sábado → hueco más cercano con Carlos y otro barbero con la especialidad", () => {
    const result = allocate({ serviceId: "fade", staffId: "carlos", date: SATURDAY }, ctx({ appointments: fullCarlos }));
    expect(result.status).toBe("alternatives");
    expect(result.reason).toBe("staff_full");
    const kinds = result.alternatives.map((a) => a.kind);
    expect(kinds).toContain("same_staff_other_time");
    expect(kinds).toContain("other_staff_same_day");
    const sameStaff = result.alternatives.find((a) => a.kind === "same_staff_other_time")!;
    expect(sameStaff.staffId).toBe("carlos");
    expect(local(sameStaff.start).date).toBe(FRIDAY);
    const other = result.alternatives.find((a) => a.kind === "other_staff_same_day")!;
    expect(other.staffId).toBe("luis");
  });

  it("hora exacta ocupada → time_taken y la misma hora con otro barbero encabeza", () => {
    const taken = [appointment("carlos", SATURDAY, "15:00", 60)];
    const result = allocate({ serviceId: "fade", staffId: "carlos", date: SATURDAY, time: "15:00" }, ctx({ appointments: taken }));
    expect(result.status).toBe("alternatives");
    expect(result.reason).toBe("time_taken");
    const other = result.alternatives.find((a) => a.kind === "other_staff_same_day")!;
    expect(other.staffId).toBe("luis");
    expect(local(other.start).time).toBe("15:00");
  });

  it("estilista en su día libre → staff_off", () => {
    const result = allocate({ serviceId: "barba", staffId: "miguel", date: SATURDAY }, ctx());
    expect(result.status).toBe("alternatives");
    expect(result.reason).toBe("staff_off");
    expect(result.alternatives[0]!.staffId).toBe("miguel");
  });

  it("nunca propone una hora que choca con otra cita", () => {
    const appts = [...fullCarlos, ...fillDay("luis", SATURDAY, 45)];
    const result = allocate({ serviceId: "fade", staffId: "carlos", date: SATURDAY }, ctx({ appointments: appts }));
    for (const alt of result.alternatives) {
      const start = Date.parse(alt.start);
      const end = Date.parse(alt.end);
      const clash = appts.some((a) => a.staffId === alt.staffId && Date.parse(a.start) < end && start < Date.parse(a.end));
      expect(clash).toBe(false);
    }
  });
});

describe("allocate — sin opciones", () => {
  it("servicio desconocido", () => {
    expect(allocate({ serviceId: "no-existe" }, ctx()).reason).toBe("unknown_service");
  });

  it("nadie tiene la especialidad", () => {
    const result = allocate({ serviceId: "color", date: SATURDAY }, ctx());
    expect(result.status).toBe("none");
    expect(result.reason).toBe("no_capacity");
  });

  it("una fecha pasada se trata como hoy, nunca ofrece el pasado", () => {
    const result = allocate({ serviceId: "fade", staffId: "carlos", date: "2026-09-01" }, ctx());
    for (const m of result.matches) expect(Date.parse(m.start)).toBeGreaterThan(NOW);
    expect(zonedInstant("2026-10-01", "10:30", TZ)).toBeLessThanOrEqual(Date.parse(result.matches[0]!.start));
  });
});
