import { describe, expect, it } from "vitest";
import { demoServices, demoStaff } from "@/adapters/memory/seed/catalog";
import { normalizeText } from "@/domain/text";
import { parseDate, parseTime } from "@/nlu/datetime";
import { interpretRules } from "@/nlu/rules";
import type { Entities, Intent, NluContext } from "@/nlu/types";

const catalog = { services: demoServices, staff: demoStaff, today: "2026-10-01" }; // jueves
const n = normalizeText;

describe("fechas relativas", () => {
  it.each([
    ["hoy", "2026-10-01"],
    ["mañana", "2026-10-02"],
    ["pasado mañana", "2026-10-03"],
    ["el sábado", "2026-10-03"],
    ["el jueves", "2026-10-01"],
    ["el próximo jueves", "2026-10-08"],
    ["el lunes", "2026-10-05"],
    ["el 15 de octubre", "2026-10-15"],
    ["15/10", "2026-10-15"],
    ["el 5", "2026-10-05"],
    ["el 20", "2026-10-20"],
    ["mañana en la mañana", "2026-10-02"],
  ])("%s → %s", (text, expected) => {
    expect(parseDate(n(text), "2026-10-01")).toBe(expected);
  });

  it("un día del mes ya pasado salta al mes siguiente", () => {
    expect(parseDate(n("el 5"), "2026-10-20")).toBe("2026-11-05");
  });

  it("'en la mañana' es franja, no mañana", () => {
    expect(parseDate(n("el sábado en la mañana"), "2026-10-01")).toBe("2026-10-03");
    expect(parseDate(n("por la mañana"), "2026-10-01")).toBeUndefined();
  });
});

describe("horas y franjas", () => {
  it.each([
    ["a las 3", { time: "15:00" }],
    ["a las 3:30", { time: "15:30" }],
    ["a las tres y media", { time: "15:30" }],
    ["a las 10", { time: "10:00" }],
    ["a las 10 de la mañana", { time: "10:00" }],
    ["a las 7 de la noche", { time: "19:00" }],
    ["tipo 4", { time: "16:00" }],
    ["4pm", { time: "16:00" }],
    ["15:00", { time: "15:00" }],
    ["11 am", { time: "11:00" }],
    ["en la tarde", { window: { from: "12:00", to: "18:00" } }],
    ["temprano", { window: { from: "08:00", to: "12:00" } }],
    ["después de las 5", { window: { from: "17:00", to: "21:00" } }],
    ["antes de las 12", { window: { from: "07:00", to: "12:00" } }],
    ["saliendo del trabajo", { window: { from: "17:00", to: "20:00" } }],
  ])("%s", (text, expected) => {
    expect(parseTime(n(text))).toEqual(expected);
  });
});

type Case = [string, Intent, Partial<Entities>?, NluContext?];

/** Frases como las escribe un cliente dominicano por WhatsApp. */
const CORPUS: Case[] = [
  ["quiero corte con Carlos el sábado", "book", { staffId: "staff-carlos", date: "2026-10-03", serviceCategory: "corte" }],
  ["Klk, quiero pelarme mañana en la tarde", "book", { date: "2026-10-02", serviceCategory: "corte", window: { from: "12:00", to: "18:00" } }],
  ["me puedes apartar un fade con lucho el viernes a las 4", "book", { serviceId: "svc-fade", staffId: "staff-luis", date: "2026-10-02", time: "16:00" }],
  ["necesito un desvanecido para hoy", "book", { serviceId: "svc-fade", date: "2026-10-01" }],
  ["quisiera arreglarme la barba con Miguel", "book", { serviceId: "svc-barba", staffId: "staff-miguel" }],
  ["corte y barba el sábado temprano", "book", { serviceId: "svc-combo", date: "2026-10-03", window: { from: "08:00", to: "12:00" } }],
  ["un corte para el niño el domingo", "book", { serviceId: "svc-nino", date: "2026-10-04" }],
  ["quiero hacerme un tinte con Andrea", "book", { serviceId: "svc-color", staffId: "staff-andrea" }],
  ["Rafa tiene espacio el sábado?", "availability", { staffId: "staff-rafa", date: "2026-10-03" }],
  ["qué tienen libre mañana?", "availability", { date: "2026-10-02" }],
  ["hay chance hoy después de las 5?", "availability", { date: "2026-10-01", window: { from: "17:00", to: "21:00" } }],
  ["a qué hora hay para un fade el sábado", "availability", { serviceId: "svc-fade", date: "2026-10-03" }],
  ["quiero un fade con cualquiera el sábado", "book", { serviceId: "svc-fade", anyStaff: true }],
  ["quiero cita con carlo pasado mañana", "book", { staffId: "staff-carlos", date: "2026-10-03" }],
  ["Buenas, me pelo con Carlitos el jueves que viene?", "book", { staffId: "staff-carlos", date: "2026-10-08" }],
  ["sí", "affirm"],
  ["Dale", "affirm"],
  ["ok perfecto", "affirm"],
  ["de una", "affirm"],
  ["ta bien", "affirm"],
  ["apártamelo", "affirm"],
  ["no", "deny"],
  ["nah, ahora no", "deny"],
  ["no gracias", "deny"],
  ["no, mejor el viernes", "book", { date: "2026-10-02" }],
  ["la primera", "choose", { choice: 1 }, { awaiting: "choice" }],
  ["la 2", "choose", { choice: 2 }, { awaiting: "choice" }],
  ["3", "choose", { choice: 3 }, { awaiting: "choice" }],
  ["la última", "choose", { choice: 99 }, { awaiting: "choice" }],
  ["la de las 4", "choose", { time: "16:00" }, { awaiting: "choice", optionTimes: ["10:00", "16:00"] }],
  ["sí, el sábado a las 10", "book", { date: "2026-10-03", time: "10:00" }, { awaiting: "reactivation" }],
  ["cancela mi cita", "cancel"],
  ["no voy a poder ir el sábado", "cancel", { date: "2026-10-03" }],
  ["tengo que cancelar, surgió algo", "cancel"],
  ["quiero cambiar mi cita para el domingo", "reschedule", { date: "2026-10-04" }],
  ["avísame si se libera algo el sábado con Carlos", "waitlist", { staffId: "staff-carlos", date: "2026-10-03" }],
  ["ponme en lista de espera", "waitlist"],
  ["BAJA", "opt_out"],
  ["no me escriban más por favor", "opt_out"],
  ["gracias manito", "thanks"],
  ["Hola!", "greeting"],
  ["buenas tardes", "greeting"],
  ["klk", "greeting"],
  ["cómo funciona esto?", "help"],
  ["jajaja", "unknown"],
];

describe("intérprete por reglas — corpus dominicano", () => {
  it(`cubre al menos 40 frases`, () => expect(CORPUS.length).toBeGreaterThanOrEqual(40));

  it.each(CORPUS)("%s → %s", (text, intent, entities, context) => {
    const result = interpretRules(text, catalog, context);
    expect(result.intent).toBe(intent);
    if (entities) expect(result.entities).toMatchObject(entities);
  });

  it("lo desconocido sale con confianza baja (candidato a Claude)", () => {
    expect(interpretRules("el gato de mi vecina", catalog).confidence).toBeLessThan(0.5);
  });

  it("no confunde palabras comunes con nombres de barberos", () => {
    expect(interpretRules("quiero un corte", catalog).entities.staffId).toBeUndefined();
  });
});
