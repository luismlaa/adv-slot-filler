import type { Metadata } from "next";
import { WaitlistPanel } from "@/components/waitlist/waitlist-panel";

export const metadata: Metadata = { title: "Lista de espera · Slot Filler" };

export default function WaitlistPage() {
  return <WaitlistPanel />;
}
