import "server-only";
import type { DemoDeps } from "@/services/demo-script";
import { DEMO_CALENDAR, demoScope } from "./container";
import { requireDemo } from "./http";

/** Dependencias del reloj y el calendario de la demo (falla con 404 fuera de modo demo). */
export async function demoDeps(): Promise<DemoDeps> {
  const demo = requireDemo();
  const { ctx, calendarSync } = await demoScope();
  return { ctx, clock: demo.clock, calendar: demo.calendar, calendarSync, calendarId: DEMO_CALENDAR.calendarId, calendarStaffId: DEMO_CALENDAR.staffId };
}
