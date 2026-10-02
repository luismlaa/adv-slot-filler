import "server-only";
import type { DemoDeps } from "@/services/demo-script";
import { DEMO_CALENDAR, getContainer } from "./container";
import { requireDemo } from "./http";

/** Dependencias del guion de demo (falla con 404 fuera de modo demo). */
export function demoDeps(): DemoDeps {
  const demo = requireDemo();
  const { ctx, calendarSync } = getContainer();
  return { ctx, clock: demo.clock, calendar: demo.calendar, calendarSync, calendarId: DEMO_CALENDAR.calendarId, calendarStaffId: DEMO_CALENDAR.staffId };
}
