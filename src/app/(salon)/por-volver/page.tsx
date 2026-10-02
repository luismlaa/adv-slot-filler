import type { Metadata } from "next";
import { ReturningPanel } from "@/components/returning/returning-panel";

export const metadata: Metadata = { title: "Por volver · Slot Filler" };

export default function ReturningPage() {
  return <ReturningPanel />;
}
