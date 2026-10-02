# Fases de deploy (D1–D5)

El código y la interfaz están completos y probados. Lo que sigue depende de **cuentas, verificaciones o datos del cliente**.

**Modelo:** una sola instancia (un Worker + un Supabase por entorno) atiende a **N salones**.
- Cada salón tiene sus datos aislados por `salon_id`, con RLS y FKs compuestas.
- Cada salón tiene su número de WhatsApp.
- Los usuarios entran a su salón según su membresía.
- Dar de alta un cliente nuevo es correr un comando: `npm run salon:create`.

**Entornos:**

| Entorno | Worker | Supabase | Cuándo se despliega |
|---|---|---|---|
| staging | `slot-filler-staging` | proyecto `slot-filler-staging` | en cada push a `main` (workflow **Deploy**) |
| production | `slot-filler` | proyecto `slot-filler` | a mano: Actions → **Deploy** → `production`, con aprobación |

## Costos

| Pieza | Plan | Costo | Nota |
|---|---|---|---|
| Cloudflare Workers | **Paid** | US$5/mes | El free da 10 ms de CPU por petición y el tick de un salón con historial no cabe. Paid da 30 s. |
| Supabase | Free para staging, **Pro** para producción | US$25/mes en Pro | Free pausa el proyecto tras 7 días sin actividad y no tiene PITR. Pasar a Pro con el primer salón que pague. |
| WhatsApp | por uso | variable | Meta cobra cada conversación iniciada con plantilla. |
| Claude (D4) | por uso | variable | Tope diario en código (`LLM_DAILY_LIMIT`) más un tope mensual en la consola. |

---

## D1. Infraestructura

**Necesitas:**
- una cuenta de Supabase con dos proyectos (staging y producción, región us-east-1);
- una cuenta de Cloudflare en plan Workers Paid;
- el repositorio en GitHub;
- un dominio, por ejemplo `app.tudominio.com` y `staging.tudominio.com`. Meta y Google lo exigen para verificar.

### 1. Supabase (en cada proyecto)

1. Habilita las extensiones `pg_cron` y `pg_net` (Database → Extensions).
2. En Authentication → URL Configuration:
   - Site URL: `https://TU-DOMINIO`
   - Redirect URL: `https://TU-DOMINIO/auth/callback`

   El login es por enlace mágico y solo entran usuarios invitados.
3. Las migraciones las aplica el workflow de deploy. La primera vez puedes aplicarlas a mano con `npx supabase db push --db-url "$SUPABASE_DB_URL"`.

### 2. Cloudflare

1. Crea un API token con la plantilla «Edit Cloudflare Workers».
2. Anota tu Account ID.
3. Carga los secretos de cada entorno: `npx wrangler secret put NOMBRE --env staging`, y lo mismo con `--env production`.

| Secreto | Valor |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto de ese entorno |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon key del proyecto |
| `SUPABASE_SERVICE_ROLE_KEY` | service role key del proyecto |
| `CRON_SECRET` | `openssl rand -hex 32` |
| `APP_URL` | `https://TU-DOMINIO` |
| `LEGAL_ENTITY_NAME`, `LEGAL_CONTACT_EMAIL` | razón social y correo para `/privacidad` y `/terminos` |

4. Asocia el dominio en Workers → `slot-filler` → Settings → Domains & Routes.

### 3. GitHub (Settings → Environments)

Crea los environments `staging` y `production`. En `production`, activa **Required reviewers**.

**Por environment:**
- **Variables:**
  - `APP_URL`
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `CLOUDFLARE_ACCOUNT_ID`
- **Secretos:**
  - `CLOUDFLARE_API_TOKEN`
  - `SUPABASE_DB_URL` (connection string, en Database → Connect)
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `BACKUP_PASSPHRASE`: solo en producción. Guárdala también fuera de GitHub, porque sin ella los respaldos no se pueden abrir.

**Variable de repositorio:** `DEPLOY_ENABLED=true`. Mientras no exista, los workflows de deploy y backup no hacen nada.

### 4. Primer deploy

1. Haz merge a `main`. El workflow **Deploy** corre en orden:
   1. check
   2. migraciones
   3. tests de integración contra staging (el adaptador Supabase contra una base real)
   4. build
   5. deploy
   6. smoke test de `/api/health`
2. Producción: Actions → Deploy → Run workflow → `production`, y aprueba.

### 5. Jobs programados (en cada proyecto)

Edita `docs/sql/cron.sql` con tu URL y tu `CRON_SECRET`, y ejecútalo en el SQL editor.
- Los valores quedan en Vault.
- El job hace una petición por salón activo, así que los salones nuevos entran solos.

### 6. Monitoreo

- **Logs:** Workers → `slot-filler` → Logs (Workers Logs ya está activo en `wrangler.jsonc`). Los logs son JSON con `salonId`, `clientId` y el motivo.
- **Uptime:** crea un monitor gratis (Better Stack, UptimeRobot) sobre `https://TU-DOMINIO/api/health` con alerta por correo. Responde 503 si la base no contesta.
- **Crons:** usa la consulta al final de `docs/sql/cron.sql`. Muestra las respuestas que no fueron 200 en la última hora. Un tick que falla responde 500 y deja el error en los logs.
- **Respaldos:** el workflow **Backup** corre a diario a las 4:17 a. m.
  - Hace un `pg_dump` cifrado con `BACKUP_PASSPHRASE` y lo guarda 30 días.
  - Para restaurar: `gpg -d backup.sql.gz.gpg | gunzip | psql "$DB_URL"`.
  - Prueba una restauración en staging antes del primer cliente.

**Verificación:**
- `GET /api/health` responde `200` con `backend: "supabase"`.
- Los workflows Deploy y Backup terminan en verde.
- Tras 5 minutos, `cron.job_run_details` muestra corridas exitosas.

---

## Alta de un salón (por cada cliente nuevo)

1. Copia `config/salon-template.json` y edítalo con los datos del salón: especialidades, estilistas con horario y apodos, y servicios con precio, duración y ciclo.
2. Crea el salón:
   ```bash
   NEXT_PUBLIC_SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… APP_URL=https://TU-DOMINIO \
   npm run salon:create -- --name "Barbería X" --owner dueño@correo.com \
     --catalog salon-x.json --wa-phone-id <phone_number_id de Meta> \
     --address "…" --phone +1809…
   ```
   - El dueño recibe un correo de invitación.
   - Sin `--wa-phone-id`, el salón funciona pero sus envíos quedan en dry-run. Asígnalo después en `salons.whatsapp_phone_number_id`.
3. Para invitar a más personal:
   1. Supabase → Authentication → Invite user.
   2. `insert into salon_members (salon_id, user_id, role, staff_id) values (…, 'reception' | 'staff', …)`.
4. Importa el historial (D5) y deja 1 semana con `MESSAGING_DRY_RUN=true` para revisar qué habría enviado.
5. Para suspender un salón: `update salons set active = false where id = '…'`. Deja de recibir crons y webhooks y sus usuarios no entran.

---

## D2. WhatsApp Business (Meta Cloud API)

Una sola app de Meta (una WABA) con **un número por salón**. El webhook es uno solo y el número que recibe cada mensaje identifica al salón.

**Necesitas del cliente:**
- Meta Business Manager verificado (documentos del negocio), o que el salón se agregue a tu WABA.
- Un número de teléfono que no esté en la app de WhatsApp.
- El nombre visible del negocio aprobado.

1. En Meta for Developers, crea la app (tipo Business) y agrega WhatsApp. Anota:
   - un token de sistema permanente (`WHATSAPP_ACCESS_TOKEN`)
   - el App Secret (`WHATSAPP_APP_SECRET`)
   - el `phone_number_id` de cada número: va en el alta del salón (`--wa-phone-id`)
2. Registra estas **plantillas** (categoría *Utility*, idioma `es`). Los nombres están en `src/services/notify.ts`:

   | Plantilla | Uso | Parámetros |
   |---|---|---|
   | `slot_offer_v1` | Oferta de hueco por cancelación | `{{1}}` nombre, `{{2}}` barbero, `{{3}}` cuándo, `{{4}}` minutos para responder |
   | `cycle_reminder_v1` | Invitación por ciclo ("ya te toca") | `{{1}}` nombre, `{{2}}` semanas, `{{3}}` barbero, `{{4}}` espacio propuesto |
   | `appointment_reminder_v1` | Recordatorio de cita | Reservada para una versión siguiente |

3. Webhook:
   - URL: `https://TU-DOMINIO/api/webhooks/whatsapp`
   - `WHATSAPP_VERIFY_TOKEN`: igual al que cargues como secreto.
   - Suscríbete al campo `messages`.
4. Secretos de Wrangler: `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_APP_SECRET` y `WHATSAPP_VERIFY_TOKEN`. En `wrangler.jsonc` → `env.production.vars`, pon `MESSAGING_CHANNEL=whatsapp`.
5. **Empieza con `MESSAGING_DRY_RUN=true`** un día: los envíos quedan en el log sin salir. Después ponlo en `false`. **Requiere aprobación del dueño.**
6. Consentimiento: el salón informa que escribirá por WhatsApp. "BAJA" ya desactiva los avisos proactivos.

## D3. Google Calendar (sync bidireccional)

**Necesitas:** un proyecto de Google Cloud y el dominio verificado en Search Console.

1. Habilita Google Calendar API.
2. Configura la pantalla de consentimiento OAuth:
   - tipo externo
   - scope `https://www.googleapis.com/auth/calendar.events`
   - enlaces a `https://TU-DOMINIO/privacidad` y `https://TU-DOMINIO/terminos`
3. **Verificación de la app.** El scope es *sensible* y la revisión tarda de días a semanas. Mientras tanto, el modo "Testing" admite hasta 100 usuarios de prueba, suficiente para el piloto.
4. Crea las credenciales OAuth (Web) con redirect `https://TU-DOMINIO/api/calendar/google/callback`.
   - Secretos: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` y `GOOGLE_WEBHOOK_URL=https://TU-DOMINIO/api/webhooks/google-calendar`.
   - Variable: `CALENDAR_PROVIDER=google`.
5. Cada barbero entra a `/barbero` y pulsa **Conectar Google Calendar**. Los pushes de Google se enrutan al salón dueño del canal.
6. Los canales `watch` vencen en unos 7 días. El cron de calendario, cada 30 minutos, hace sync incremental como red de seguridad. Renovar los canales automáticamente queda en el backlog.

**Re-evaluar** (decisión del dueño, 2026-10-02): si la verificación de Google se complica, el plan B es exportar solo un feed iCal de lectura, sin OAuth.

## D4. Claude como respaldo del intérprete

1. Crea una API key en console.anthropic.com y fija un **límite de gasto mensual**.
2. Secreto `ANTHROPIC_API_KEY`. Variable `LLM_PROVIDER=claude`. Opcional: `LLM_DAILY_LIMIT`, por defecto 300 consultas al día por instancia.
3. El modelo es `CLAUDE_MODEL`, por defecto `claude-opus-5-5`.
   - Solo se llama cuando las reglas tienen confianza < 0.5.
   - Claude solo interpreta: las respuestas siempre salen de plantillas.
   - Si falla o no hay red, se usan las reglas.
4. Revisa los logs (`source: "claude"`) la primera semana. Si un patrón se repite, agrégalo a las reglas: es gratis y más rápido.

## D5. Datos del salón piloto y legal

1. **Historial:** pide al salón un Excel o CSV con las columnas `cliente, telefono, fecha, hora, servicio, barbero, precio, estado`.
   ```bash
   npm run import:csv -- historial.csv --salon <id>          # dry-run: muestra errores por línea
   npm run import:csv -- historial.csv --salon <id> --apply  # guarda
   ```
   Con 3 a 6 meses de historial, cada cliente tiene su ciclo real desde el día uno.
2. **Legal (RD):** `/privacidad` y `/terminos` ya existen.
   - Son un **borrador**: falta la revisión de un abogado conforme a la Ley 172-13.
   - Muestran un aviso hasta que se configuren `LEGAL_ENTITY_NAME` y `LEGAL_CONTACT_EMAIL`.
3. **Derecho de borrado:** `npm run client:erase -- --salon <id> --phone +1809… --apply`.
   - Borra mensajes, conversación, lista de espera, ofertas e invitaciones.
   - Anonimiza al cliente y conserva las citas como datos agregados para las métricas.
4. Fuera de alcance por ahora: pagos y facturación.

---

## Checklist P0 antes de abrir a clientes

| Ítem | Estado |
|---|---|
| Validación de esquema en cada frontera | ✅ zod en API, webhooks, salida de NLU/Claude, filas de BD, catálogo de alta |
| Guardas en código, no solo en prompts | ✅ baja, horas de silencio, límite por minuto, dry-run, TTL de ofertas, cooldown, tope diario de Claude |
| Aislamiento entre salones | ✅ Store acotado, upsert que no cruza salones, RLS, FKs compuestas, SSE filtrado; probado sobre Postgres |
| Logging con contexto de negocio | ✅ JSON con salón, cliente, cita y motivo; secretos redactados; Workers Logs |
| Idempotencia | ✅ wamid único, un hueco por cancelación, oferta única por cliente y hueco, CAS en estados |
| Credenciales solo en env | ✅ secretos de Wrangler y de GitHub Environments; cron con Vault |
| Timeouts y reintentos | ✅ WhatsApp, Google, Supabase y Claude |
| Autenticación y autorización | ✅ enlace mágico por invitación; salón según membresía; un miembro no puede cambiar el número ni el estado |
| Doble reserva imposible | ✅ exclusion constraint en Postgres y compare-and-set en memoria |
| Migraciones probadas | ✅ en CI sobre PGlite; ⏳ adaptador Supabase completo: corre en el primer deploy a staging |
| Respaldos | ⏳ workflow listo; activar con `DEPLOY_ENABLED` y probar una restauración |
| Monitoreo | ⏳ configurar el monitor de uptime |
| Legal | ⏳ revisión de un abogado y datos del operador |
| Tests con datos reales anonimizados | ⏳ D5: agregar al corpus frases reales del salón piloto |
