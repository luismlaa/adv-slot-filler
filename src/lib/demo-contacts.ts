import { PERSONAS } from "@/adapters/memory/seed/people";

export interface ChatContact {
  readonly key: string;
  readonly name: string;
  readonly phone: string;
}

/** Clientes con los que el presentador puede chatear en `/chat` (demo): los del guion y uno nuevo. */
export const CHAT_CONTACTS: readonly ChatContact[] = [
  ...Object.entries(PERSONAS).map(([key, p]) => ({ key, name: p.name, phone: p.phone })),
  { key: "nuevo", name: "Cliente nuevo", phone: "+18295550199" },
];

export const contactByPhone = (phone: string | undefined) => CHAT_CONTACTS.find((c) => c.phone === phone);
