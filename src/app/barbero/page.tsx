import type { Metadata, Viewport } from "next";
import { BarberDay } from "@/components/barber/barber-day";

export const metadata: Metadata = { title: "Mi día · Slot Filler" };
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function BarberPage() {
  return <BarberDay />;
}
