import type { Metadata } from "next";
import { AgendaBoard } from "@/components/board/agenda-board";
import { localDateSchema } from "@/domain/model";

export const metadata: Metadata = { title: "Agenda · Slot Filler" };

/** `?date=AAAA-MM-DD` abre la agenda en ese día (enlaces compartibles). */
export default async function AgendaPage({ searchParams }: PageProps<"/agenda">) {
  const { date } = await searchParams;
  const parsed = localDateSchema.safeParse(date);
  return <AgendaBoard key={parsed.data ?? "today"} initialDate={parsed.success ? parsed.data : undefined} />;
}
