-- Slot Filler — una instancia, N salones.
-- Cada salón tiene su número de WhatsApp (todos bajo la misma app/WABA de Meta), un slug y un
-- interruptor de activo. El directorio de salones resuelve webhooks, pushes y crons con estas columnas.

alter table public.salons
  add column slug text,
  add column active boolean not null default true,
  add column whatsapp_phone_number_id text;

update public.salons set slug = id where slug is null;
alter table public.salons alter column slug set not null;

create unique index salons_slug_key on public.salons (slug);
create unique index salons_whatsapp_phone_number_id_key on public.salons (whatsapp_phone_number_id) where whatsapp_phone_number_id is not null;
create index salons_active_idx on public.salons (active) where active;
create unique index calendar_links_channel_id_key on public.calendar_links (channel_id) where channel_id is not null;
create index salon_members_user_idx on public.salon_members (user_id);

-- Un miembro puede editar los datos de su salón, pero nunca el número de WhatsApp, el slug ni el
-- estado: eso lo administra el operador (service role) al dar de alta o suspender un salón.
revoke update on public.salons from authenticated;
grant update (name, timezone, currency, phone, address, settings) on public.salons to authenticated;

-- Aislamiento en la base, además del código: una fila solo puede apuntar a estilistas, servicios y
-- clientes de SU salón. Las FKs simples (id) siguen ahí; estas compuestas agregan el salón.
create unique index staff_salon_id_key on public.staff (salon_id, id);
create unique index services_salon_id_key on public.services (salon_id, id);
create unique index clients_salon_id_key on public.clients (salon_id, id);

alter table public.appointments
  add constraint appointments_staff_same_salon foreign key (salon_id, staff_id) references public.staff (salon_id, id),
  add constraint appointments_service_same_salon foreign key (salon_id, service_id) references public.services (salon_id, id),
  add constraint appointments_client_same_salon foreign key (salon_id, client_id) references public.clients (salon_id, id);
alter table public.blocks
  add constraint blocks_staff_same_salon foreign key (salon_id, staff_id) references public.staff (salon_id, id) on delete cascade;
alter table public.waitlist_entries
  add constraint waitlist_client_same_salon foreign key (salon_id, client_id) references public.clients (salon_id, id) on delete cascade,
  add constraint waitlist_service_same_salon foreign key (salon_id, service_id) references public.services (salon_id, id) on delete cascade;
alter table public.gaps
  add constraint gaps_staff_same_salon foreign key (salon_id, staff_id) references public.staff (salon_id, id) on delete cascade;
alter table public.offers
  add constraint offers_client_same_salon foreign key (salon_id, client_id) references public.clients (salon_id, id) on delete cascade,
  add constraint offers_staff_same_salon foreign key (salon_id, staff_id) references public.staff (salon_id, id) on delete cascade;
alter table public.calendar_links
  add constraint calendar_links_staff_same_salon foreign key (salon_id, staff_id) references public.staff (salon_id, id) on delete cascade;
