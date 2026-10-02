-- Slot Filler — esquema inicial (multi-tenant por salon_id)
-- Las ids son text para aceptar tanto uuid como ids legibles del seed de demo.

create extension if not exists btree_gist;

-- ─── Salones y miembros ──────────────────────────────────────────────
create table public.salons (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  timezone text not null default 'America/Santo_Domingo',
  currency char(3) not null default 'DOP',
  phone text,
  address text,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.salon_members (
  salon_id text not null references public.salons (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'reception', 'staff')),
  staff_id text,
  created_at timestamptz not null default now(),
  primary key (salon_id, user_id)
);

-- ─── Catálogo ───────────────────────────────────────────────────────
create table public.specialties (
  salon_id text not null references public.salons (id) on delete cascade,
  id text not null,
  name text not null,
  primary key (salon_id, id)
);

create table public.staff (
  id text primary key default gen_random_uuid()::text,
  salon_id text not null references public.salons (id) on delete cascade,
  name text not null,
  aliases text[] not null default '{}',
  specialties text[] not null default '{}',
  schedule jsonb not null,
  color text not null,
  phone text,
  active boolean not null default true
);
create index staff_salon_idx on public.staff (salon_id);

create table public.services (
  id text primary key default gen_random_uuid()::text,
  salon_id text not null references public.salons (id) on delete cascade,
  name text not null,
  category text not null check (category in ('corte', 'barba', 'color', 'tratamiento', 'otro')),
  duration_minutes int not null check (duration_minutes between 5 and 480),
  buffer_minutes int not null default 0 check (buffer_minutes between 0 and 60),
  price numeric(10, 2) not null check (price >= 0),
  required_specialties text[] not null default '{}',
  default_cycle_days int not null check (default_cycle_days between 1 and 365),
  keywords text[] not null default '{}',
  active boolean not null default true
);
create index services_salon_idx on public.services (salon_id);

create table public.clients (
  id text primary key default gen_random_uuid()::text,
  salon_id text not null references public.salons (id) on delete cascade,
  name text not null,
  phone text not null check (phone ~ '^\+\d{8,15}$'),
  preferred_staff_id text references public.staff (id) on delete set null,
  opted_out boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  unique (salon_id, phone)
);

-- ─── Agenda ─────────────────────────────────────────────────────────
create table public.appointments (
  id text primary key default gen_random_uuid()::text,
  salon_id text not null references public.salons (id) on delete cascade,
  client_id text not null references public.clients (id) on delete restrict,
  staff_id text not null references public.staff (id) on delete restrict,
  service_id text not null references public.services (id) on delete restrict,
  start_at timestamptz not null,
  end_at timestamptz not null,
  status text not null check (status in ('booked', 'completed', 'cancelled', 'no_show')),
  source text not null check (source in ('whatsapp', 'salon', 'gapfill', 'reactivation', 'walkin', 'import')),
  price numeric(10, 2) not null default 0,
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  cancel_reason text,
  gap_id text,
  external_event_id text,
  check (start_at < end_at),
  -- Garantía de base de datos: un estilista nunca tiene dos citas vigentes solapadas.
  constraint appointments_no_overlap exclude using gist (
    staff_id with =,
    tstzrange(start_at, end_at, '[)') with &&
  ) where (status in ('booked', 'completed'))
);
create index appointments_salon_start_idx on public.appointments (salon_id, start_at);
create index appointments_client_idx on public.appointments (salon_id, client_id, start_at);

create table public.blocks (
  id text primary key default gen_random_uuid()::text,
  salon_id text not null references public.salons (id) on delete cascade,
  staff_id text not null references public.staff (id) on delete cascade,
  start_at timestamptz not null,
  end_at timestamptz not null,
  title text not null,
  source text not null check (source in ('manual', 'calendar')),
  external_event_id text,
  created_at timestamptz not null default now(),
  check (start_at < end_at),
  unique (staff_id, external_event_id)
);
create index blocks_salon_start_idx on public.blocks (salon_id, start_at);

-- ─── Relleno de huecos y ciclos ─────────────────────────────────────
create table public.waitlist_entries (
  id text primary key default gen_random_uuid()::text,
  salon_id text not null references public.salons (id) on delete cascade,
  client_id text not null references public.clients (id) on delete cascade,
  service_id text not null references public.services (id) on delete cascade,
  staff_ids text[] not null default '{}',
  window_start timestamptz not null,
  window_end timestamptz not null,
  status text not null check (status in ('active', 'fulfilled', 'expired', 'cancelled')),
  created_at timestamptz not null default now(),
  check (window_start < window_end)
);
create index waitlist_salon_status_idx on public.waitlist_entries (salon_id, status);

create table public.gaps (
  id text primary key default gen_random_uuid()::text,
  salon_id text not null references public.salons (id) on delete cascade,
  staff_id text not null references public.staff (id) on delete cascade,
  start_at timestamptz not null,
  end_at timestamptz not null,
  -- Idempotencia: una cancelación produce como mucho un hueco.
  origin_appointment_id text not null unique references public.appointments (id) on delete cascade,
  status text not null check (status in ('open', 'filled', 'expired')),
  wave int not null default 0,
  created_at timestamptz not null default now(),
  filled_at timestamptz,
  filled_by_appointment_id text references public.appointments (id) on delete set null
);
create index gaps_salon_status_idx on public.gaps (salon_id, status);

create table public.offers (
  id text primary key default gen_random_uuid()::text,
  salon_id text not null references public.salons (id) on delete cascade,
  gap_id text not null references public.gaps (id) on delete cascade,
  client_id text not null references public.clients (id) on delete cascade,
  service_id text not null references public.services (id) on delete cascade,
  staff_id text not null references public.staff (id) on delete cascade,
  start_at timestamptz not null,
  end_at timestamptz not null,
  wave int not null check (wave > 0),
  source text not null check (source in ('waitlist', 'cycle')),
  waitlist_entry_id text references public.waitlist_entries (id) on delete set null,
  score numeric not null default 0,
  status text not null check (status in ('pending', 'accepted', 'declined', 'expired', 'superseded')),
  sent_at timestamptz not null,
  expires_at timestamptz not null,
  responded_at timestamptz,
  -- Idempotencia: a cada cliente se le ofrece un mismo hueco una sola vez.
  unique (gap_id, client_id)
);
create index offers_salon_status_idx on public.offers (salon_id, status);
create index offers_client_idx on public.offers (salon_id, client_id, sent_at desc);

create table public.nudges (
  id text primary key default gen_random_uuid()::text,
  salon_id text not null references public.salons (id) on delete cascade,
  client_id text not null references public.clients (id) on delete cascade,
  category text not null,
  service_id text not null references public.services (id) on delete cascade,
  due_date date not null,
  last_visit_appointment_id text not null,
  status text not null check (status in ('sent', 'booked', 'declined', 'ignored')),
  sent_at timestamptz not null,
  booked_appointment_id text references public.appointments (id) on delete set null
);
create index nudges_client_idx on public.nudges (salon_id, client_id, sent_at desc);

-- ─── Mensajería ─────────────────────────────────────────────────────
create table public.messages (
  id text primary key default gen_random_uuid()::text,
  salon_id text not null references public.salons (id) on delete cascade,
  phone text not null,
  client_id text references public.clients (id) on delete set null,
  direction text not null check (direction in ('in', 'out')),
  text text not null,
  purpose text not null default 'reply',
  -- Idempotencia de webhooks: WhatsApp reintenta entregas con el mismo wamid.
  provider_message_id text unique,
  at timestamptz not null default now()
);
create index messages_phone_idx on public.messages (salon_id, phone, at);

create table public.conversations (
  salon_id text not null references public.salons (id) on delete cascade,
  phone text not null,
  state jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (salon_id, phone)
);

create table public.calendar_links (
  salon_id text not null references public.salons (id) on delete cascade,
  staff_id text primary key references public.staff (id) on delete cascade,
  provider text not null check (provider in ('google', 'fake')),
  calendar_id text not null,
  status text not null check (status in ('connected', 'error', 'disconnected')),
  sync_token text,
  channel_id text,
  channel_resource_id text,
  channel_expires_at timestamptz,
  refresh_token text,
  connected_at timestamptz not null default now(),
  last_sync_at timestamptz,
  last_error text
);

create table public.activity (
  id text primary key default gen_random_uuid()::text,
  salon_id text not null references public.salons (id) on delete cascade,
  at timestamptz not null default now(),
  kind text not null,
  severity text not null default 'info' check (severity in ('info', 'success', 'warning')),
  message text not null,
  client_id text,
  staff_id text,
  appointment_id text,
  gap_id text
);
create index activity_salon_at_idx on public.activity (salon_id, at desc);
