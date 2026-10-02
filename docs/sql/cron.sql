-- Jobs programados en Supabase (fase D1). Ejecutar en el SQL editor de CADA entorno (staging y
-- producción), NO como migración: dependen de la URL pública y del secreto de ese deploy.
-- Requiere las extensiones pg_cron, pg_net y Vault (Database → Extensions; Vault ya viene activo).

-- 1. Secretos en Vault (no quedan en texto plano en cron.job). Cambia los valores:
select vault.create_secret('https://TU-DOMINIO', 'slot_filler_app_url');
select vault.create_secret('TU_CRON_SECRET', 'slot_filler_cron_secret');

-- 2. Cada 5 minutos, UNA petición por salón activo: cierra citas terminadas, vence ofertas, avanza
--    huecos e invitaciones de ciclo. Repartirlo por salón mantiene cada petición dentro del límite de
--    CPU del Worker y aísla los fallos. Un salón nuevo entra solo, sin tocar este job.
select cron.schedule(
  'slot-filler-tick',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'slot_filler_app_url') || '/api/cron/tick?salon=' || s.id,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'slot_filler_cron_secret'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  )
  from public.salons s
  where s.active;
  $$
);

-- 3. Cada 30 minutos: red de seguridad del sync de Google Calendar (por si se pierde un push).
select cron.schedule(
  'slot-filler-calendar-sync',
  '*/30 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'slot_filler_app_url') || '/api/cron/calendar?salon=' || s.id,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'slot_filler_cron_secret'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  )
  from public.salons s
  where s.active;
  $$
);

-- Monitoreo: respuestas de los jobs en la última hora que no fueron 200.
-- select status_code, content::text, created from net._http_response
-- where created > now() - interval '1 hour' and status_code is distinct from 200 order by created desc;
