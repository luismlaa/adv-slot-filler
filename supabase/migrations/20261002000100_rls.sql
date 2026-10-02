-- Row Level Security: cada usuario autenticado solo ve los datos de los salones de los que es miembro.
-- El servidor usa la service role key (salta RLS) para webhooks y jobs; nunca se expone al navegador.

create or replace function public.is_salon_member(target_salon text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.salon_members m
    where m.salon_id = target_salon and m.user_id = auth.uid()
  );
$$;

revoke all on function public.is_salon_member(text) from public;
grant execute on function public.is_salon_member(text) to authenticated;

alter table public.salons enable row level security;
alter table public.salon_members enable row level security;
alter table public.specialties enable row level security;
alter table public.staff enable row level security;
alter table public.services enable row level security;
alter table public.clients enable row level security;
alter table public.appointments enable row level security;
alter table public.blocks enable row level security;
alter table public.waitlist_entries enable row level security;
alter table public.gaps enable row level security;
alter table public.offers enable row level security;
alter table public.nudges enable row level security;
alter table public.messages enable row level security;
alter table public.conversations enable row level security;
alter table public.calendar_links enable row level security;
alter table public.activity enable row level security;

create policy "miembros ven su salón" on public.salons
  for select to authenticated using (public.is_salon_member(id));
create policy "miembros editan su salón" on public.salons
  for update to authenticated using (public.is_salon_member(id)) with check (public.is_salon_member(id));

create policy "cada quien ve sus membresías" on public.salon_members
  for select to authenticated using (user_id = auth.uid());

-- Tablas operativas: lectura y escritura completas para miembros del salón.
do $$
declare
  t text;
begin
  foreach t in array array[
    'specialties', 'staff', 'services', 'clients', 'appointments', 'blocks',
    'waitlist_entries', 'gaps', 'offers', 'nudges', 'messages', 'activity'
  ]
  loop
    execute format(
      'create policy "miembros operan %1$s" on public.%1$I for all to authenticated
         using (public.is_salon_member(salon_id)) with check (public.is_salon_member(salon_id))',
      t
    );
  end loop;
end
$$;

-- conversations y calendar_links (contiene refresh tokens OAuth) no tienen políticas:
-- solo el servidor (service role) puede leerlas o escribirlas.

-- Tiempo real para el tablero del salón.
alter publication supabase_realtime add table
  public.appointments, public.blocks, public.gaps, public.offers, public.messages, public.activity;
