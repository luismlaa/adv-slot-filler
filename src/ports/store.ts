import type {
  Activity,
  Appointment,
  AppointmentStatus,
  Block,
  CalendarLink,
  Client,
  ConversationRecord,
  Gap,
  Id,
  Message,
  Nudge,
  Offer,
  OfferStatus,
  Salon,
  Service,
  Specialty,
  Staff,
  WaitlistEntry,
} from "@/domain/model";

export interface AppointmentFilter {
  /** Citas que se solapan con [from, to). ISO. */
  readonly from?: string;
  readonly to?: string;
  readonly clientId?: Id;
  readonly staffId?: Id;
  readonly statuses?: readonly AppointmentStatus[];
}

export type InsertResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly reason: "conflict" };

/**
 * Persistencia de un salón. Todas las operaciones están acotadas al salón de la instancia.
 * Las operaciones `transition*` / `insertIfFree` son compare-and-set atómicos: es lo que garantiza
 * "el primero que acepta gana" sin transacciones genéricas.
 */
export interface Store {
  readonly salonId: Id;

  salon: {
    get(): Promise<Salon>;
    updateSettings(settings: Record<string, unknown>): Promise<Salon>;
  };
  specialties: {
    list(): Promise<Specialty[]>;
  };
  staff: {
    list(): Promise<Staff[]>;
    upsert(staff: Staff): Promise<Staff>;
  };
  services: {
    list(): Promise<Service[]>;
    upsert(service: Service): Promise<Service>;
  };
  clients: {
    list(): Promise<Client[]>;
    get(id: Id): Promise<Client | undefined>;
    findByPhone(phone: string): Promise<Client | undefined>;
    insert(client: Client): Promise<Client>;
    update(id: Id, patch: Partial<Omit<Client, "id" | "salonId">>): Promise<Client | undefined>;
  };
  appointments: {
    list(filter?: AppointmentFilter): Promise<Appointment[]>;
    get(id: Id): Promise<Appointment | undefined>;
    /** Inserta solo si el estilista no tiene otra cita vigente solapada. */
    insertIfFree(appointment: Appointment): Promise<InsertResult<Appointment>>;
    /** Cambia la cita solo si su estado actual está en `from`. */
    transition(id: Id, from: readonly AppointmentStatus[], patch: Partial<Appointment>): Promise<Appointment | undefined>;
    update(id: Id, patch: Partial<Omit<Appointment, "id" | "salonId">>): Promise<Appointment | undefined>;
  };
  blocks: {
    list(filter?: { from?: string; to?: string; staffId?: Id }): Promise<Block[]>;
    upsert(block: Block): Promise<Block>;
    delete(id: Id): Promise<void>;
  };
  waitlist: {
    list(statuses?: readonly WaitlistEntry["status"][]): Promise<WaitlistEntry[]>;
    insert(entry: WaitlistEntry): Promise<WaitlistEntry>;
    update(id: Id, patch: Partial<Omit<WaitlistEntry, "id" | "salonId">>): Promise<WaitlistEntry | undefined>;
  };
  gaps: {
    list(statuses?: readonly Gap["status"][]): Promise<Gap[]>;
    get(id: Id): Promise<Gap | undefined>;
    insert(gap: Gap): Promise<Gap>;
    transition(id: Id, from: Gap["status"], patch: Partial<Gap>): Promise<Gap | undefined>;
  };
  offers: {
    list(filter?: { gapId?: Id; clientId?: Id; statuses?: readonly OfferStatus[]; sentAfter?: string }): Promise<Offer[]>;
    get(id: Id): Promise<Offer | undefined>;
    insertMany(offers: readonly Offer[]): Promise<Offer[]>;
    transition(id: Id, from: OfferStatus, patch: Partial<Offer>): Promise<Offer | undefined>;
  };
  nudges: {
    list(filter?: { clientId?: Id; statuses?: readonly Nudge["status"][] }): Promise<Nudge[]>;
    insert(nudge: Nudge): Promise<Nudge>;
    update(id: Id, patch: Partial<Omit<Nudge, "id" | "salonId">>): Promise<Nudge | undefined>;
  };
  messages: {
    list(filter?: { phone?: string; limit?: number }): Promise<Message[]>;
    insert(message: Message): Promise<Message>;
    existsProviderId(providerMessageId: string): Promise<boolean>;
  };
  conversations: {
    get(phone: string): Promise<ConversationRecord | undefined>;
    save(record: ConversationRecord): Promise<void>;
  };
  calendarLinks: {
    list(): Promise<CalendarLink[]>;
    get(staffId: Id): Promise<CalendarLink | undefined>;
    upsert(link: CalendarLink): Promise<CalendarLink>;
  };
  activity: {
    list(limit?: number): Promise<Activity[]>;
    insert(entry: Activity): Promise<Activity>;
  };
}
