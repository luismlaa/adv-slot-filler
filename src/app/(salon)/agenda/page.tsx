import type { Metadata } from "next";
import { AgendaBoard } from "@/components/board/agenda-board";

export const metadata: Metadata = { title: "Agenda · Slot Filler" };

export default function AgendaPage() {
  return <AgendaBoard />;
}
