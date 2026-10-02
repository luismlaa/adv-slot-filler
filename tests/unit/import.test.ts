import { describe, expect, it } from "vitest";
import { demoServices, demoStaff } from "@/adapters/memory/seed/catalog";
import { normalizePhone } from "@/domain/text";
import { parseCsv } from "@/services/import/csv";
import { importHistoryCsv } from "@/services/import/history";

let n = 0;
const ctx = {
  salonId: "salon-x",
  timezone: "America/Santo_Domingo",
  staff: demoStaff,
  services: demoServices,
  existingClients: [],
  now: Date.parse("2026-10-01T14:00:00Z"),
  newId: () => `id-${++n}`,
};

describe("parseCsv", () => {
  it("maneja comillas, comas internas y punto y coma", () => {
    expect(parseCsv('a,b\n"Pérez, Juan","dijo ""hola"""\n')).toEqual([["a", "b"], ["Pérez, Juan", 'dijo "hola"']]);
    expect(parseCsv("a;b\r\n1;2")).toEqual([["a", "b"], ["1", "2"]]);
  });
});

describe("normalizePhone", () => {
  it("convierte teléfonos dominicanos a E.164", () => {
    expect(normalizePhone("809-555-0101")).toBe("+18095550101");
    expect(normalizePhone("(829) 555 0101")).toBe("+18295550101");
    expect(normalizePhone("1 849 555 0101")).toBe("+18495550101");
    expect(normalizePhone("+34 600 000 000")).toBe("+34600000000");
    expect(normalizePhone("5550101")).toBeUndefined();
  });
});

describe("importHistoryCsv", () => {
  const csv = [
    "Cliente,Teléfono,Fecha,Hora,Servicio,Barbero,Precio,Estado",
    "Pedro Martínez,809-555-0101,2026-08-01,4:00 pm,Fade,Carlos,700,",
    "Pedro Martínez,8095550101,29/08/2026,16:00,degradado,carlos,,completada",
    "Ana Gómez,829 555 0103,2026-08-20,10:00,Tinte,Andrea,1800,",
    "Mal Teléfono,555,2026-08-20,10:00,Fade,Carlos,,",
    "Sin Servicio,8095550199,2026-08-20,10:00,masaje,Carlos,,",
    "Choque,8095550198,2026-08-01,16:15,Corte,Carlos,,",
    "Cancelada,8095550197,2026-08-01,16:15,Corte,Carlos,,cancelada",
  ].join("\n");
  const result = importHistoryCsv(csv, ctx);

  it("crea un cliente por teléfono y sus citas como historial", () => {
    expect(result.clients.map((c) => c.name)).toEqual(["Pedro Martínez", "Ana Gómez", "Cancelada"]);
    const pedro = result.clients[0]!;
    const visits = result.appointments.filter((a) => a.clientId === pedro.id);
    expect(visits).toHaveLength(2);
    expect(visits.every((a) => a.status === "completed" && a.source === "import" && a.serviceId === "svc-fade")).toBe(true);
    expect(visits[0]!.start).toBe("2026-08-01T20:00:00.000Z");
  });

  it("reporta errores por línea sin abortar", () => {
    expect(result.errors.map((e) => e.line)).toEqual([5, 6, 7]);
    expect(result.errors[0]!.message).toMatch(/Teléfono/);
    expect(result.errors[1]!.message).toMatch(/Servicio/);
    expect(result.errors[2]!.message).toMatch(/Choca/);
  });

  it("exige las columnas mínimas", () => {
    expect(importHistoryCsv("nombre,telefono\nx,8095550101", ctx).errors[0]!.message).toMatch(/Faltan columnas/);
  });
});
