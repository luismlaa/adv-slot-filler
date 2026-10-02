import { createMemoryStore, type MemoryDb } from "@/adapters/memory/store";
import { contractFixture, runStoreContract } from "../contract/store.contract";

runStoreContract("memory", async () => {
  const fixture = contractFixture("salon-contract");
  const db: MemoryDb = {
    salon: fixture.salon,
    specialties: fixture.specialties,
    staff: fixture.staff,
    services: fixture.services,
    clients: fixture.clients,
    appointments: [],
    blocks: [],
    waitlist: [],
    gaps: [],
    offers: [],
    nudges: [],
    messages: [],
    conversations: [],
    calendarLinks: [],
    activity: [],
  };
  return { store: createMemoryStore({ db }), fixture };
});
