import type { Metadata } from "next";
import { MetricsPanel } from "@/components/metrics/metrics-panel";

export const metadata: Metadata = { title: "Métricas · Slot Filler" };

export default function MetricsPage() {
  return <MetricsPanel />;
}
