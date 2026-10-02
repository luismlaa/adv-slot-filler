import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DemoStage } from "@/components/demo/demo-stage";
import { getContainer } from "@/lib/container";

export const metadata: Metadata = { title: "Demo · Slot Filler" };
export const dynamic = "force-dynamic";

export default function DemoPage() {
  const { env, demo } = getContainer();
  if (!env.DEMO_MODE || !demo) notFound();
  return <DemoStage />;
}
