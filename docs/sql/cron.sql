-- Jobs programados en Supabase (fase D1). Ejecutar en el SQL editor del proyecto, NO como migración:
-- contiene la URL pública y el secreto, que dependen del deploy.
-- Requiere las extensiones pg_cron y pg_net (Database → Extensions).

-- Cada 5 minutos: cierra citas terminadas, vence ofertas, avanza huecos, invitaciones de ciclo.
select cron.schedule(
  'slot-filler-tick',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://TU-DOMINIO/api/cron/tick',
    headers := jsonb_build_object('Authorization', 'Bearer TU_CRON_SECRET', 'Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);

-- Cada 30 minutos: red de seguridad del sync de Google Calendar (por si se pierde un push).
select cron.schedule(
  'slot-filler-calendar-sync',
  '*/30 * * * *',
  $$
  select net.http_post(
    url := 'https://TU-DOMINIO/api/cron/calendar',
    headers := jsonb_build_object('Authorization', 'Bearer TU_CRON_SECRET', 'Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);
