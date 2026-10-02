import type { Interpretation } from "@/nlu/types";
import { localParts } from "../time";
import type { ConversationState } from "./state";

type Option = Extract<ConversationState, { step: "choosing" }>["options"][number];

/**
 * Qué opción eligió el cliente: por número ("la 2", 99 = última), por hora ("la de las 4"),
 * o un "sí" cuando solo había una opción (o en una invitación, la primera propuesta).
 */
export function resolveChoice(options: readonly Option[], interpretation: Interpretation, timezone: string, affirmPicksFirst: boolean): Option | undefined {
  const { choice, time, date } = interpretation.entities;
  if (choice !== undefined) return choice === 99 ? options.at(-1) : options[choice - 1];
  if (time !== undefined) {
    const matches = options.filter((o) => {
      const parts = localParts(Date.parse(o.start), timezone);
      return parts.time === time && (date === undefined || parts.date === date);
    });
    if (matches.length === 1) return matches[0];
  }
  if (interpretation.intent === "affirm" && (options.length === 1 || affirmPicksFirst)) return options[0];
  return undefined;
}
