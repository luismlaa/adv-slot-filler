# Fases de deploy (D1–D5)

El pre-build está completo: todo el código y la interfaz existen y están probados. Lo que sigue depende de **cuentas, verificaciones o datos del cliente**, y por eso queda para el deploy. Cada fase es independiente salvo donde se indica.

Costos: todas las piezas tienen capa gratuita con **uso comercial permitido**:
- Cloudflare Workers: 100k peticiones/día.
- Supabase free: 500 MB; pausa el proyecto tras 7 días sin actividad.

La única pieza con costo variable es **WhatsApp**, que cobra por cada conversación iniciada con plantilla.

---

## D1. Infraestructura (Supabase cloud + Cloudflare Workers)

**Necesitas del cliente o de ti:** una cuenta de Supabase, una de Cloudflare, el dominio (opcional; `*.workers.dev` sirve para el piloto) y los correos del dueño y de recepción.

1. Supabase: crea el proyecto en la región más cercana (us-east-1).
   - Aplica las migraciones: `npx supabase link --project-ref <ref>` y luego `npx supabase db push`.
   - Habilita las extensiones `pg_cron` y `pg_net`.
2. Crea el salón y sus miembros (SQL editor):
   ```sql
   insert into salons (id, name, timezone, currency) values ('<uuid>', 'Nombre del salón', 'America/Santo_Domingo', 'DOP');
   -- Tras invitar al usuario en Authentication → Users:
   insert into salon_members (salon_id, user_id, role) values ('<uuid>', '<auth user id>', 'owner');
   ```
   Carga después los estilistas, servicios y especialidades desde **Ajustes**, o súbelos por SQL.
3. Cloudflare: corre `npx wrangler login` y luego, por cada secreto, `npx wrangler secret put NOMBRE`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SALON_ID`
   - `CRON_SECRET` (genéralo con `openssl rand -hex 32`)
   - `APP_URL`

   Las variables públicas `NEXT_PUBLIC_*` también deben existir **en el momento del build**: expórtalas antes de `npm run cf:deploy`.
4. `npm run cf:deploy`.
5. Programa los jobs: edita `docs/sql/cron.sql` con tu URL y tu `CRON_SECRET` y ejecútalo en el SQL editor.
6. Auth: en Supabase, ve a Authentication → URL Configuration y agrega `https://TU-DOMINIO/auth/callback`. El login es por enlace mágico y solo entran usuarios invitados (`shouldCreateUser: false`).

**Verificación:**
- `GET /api/health` responde `200` con `backend: "supabase"`.
- Puedes entrar con el correo del dueño.
- `/agenda` carga.
- Tras 5 minutos, `cron.job_run_details` muestra corridas exitosas.

## D2. WhatsApp Business (Meta Cloud API)

**Necesitas del cliente:**
- Meta Business Manager verificado (documentos del negocio).
- Un número de teléfono que no esté en la app de WhatsApp.
- El nombre visible del negocio aprobado.

1. En Meta for Developers, crea la app (tipo Business) y agrega el producto WhatsApp. Anota:
   - `WHATSAPP_PHONE_NUMBER_ID`
   - un token de sistema permanente (`WHATSAPP_ACCESS_TOKEN`)
   - el App Secret (`WHATSAPP_APP_SECRET`)
2. Registra estas **plantillas** (categoría *Utility*, idioma `es`). Los nombres están en `src/services/notify.ts`:

   | Plantilla | Uso | Parámetros |
   |---|---|---|
   | `slot_offer_v1` | Oferta de hueco por cancelación | `{{1}}` nombre, `{{2}}` barbero, `{{3}}` cuándo, `{{4}}` minutos para responder |
   | `cycle_reminder_v1` | Invitación por ciclo ("ya te toca") | `{{1}}` nombre, `{{2}}` semanas, `{{3}}` barbero, `{{4}}` espacio propuesto |
   | `appointment_reminder_v1` | Recordatorio de cita | Reservada para una versión siguiente |

3. Webhook: URL `https://TU-DOMINIO/api/webhooks/whatsapp`, con `WHATSAPP_VERIFY_TOKEN` igual al que cargues como secreto. Suscríbete al campo `messages`.
4. Secretos: los cuatro `WHATSAPP_*`. Variable: `MESSAGING_CHANNEL=whatsapp`.
5. **Empieza con `MESSAGING_DRY_RUN=true`** un día: los envíos quedan en el log sin salir. Después ponlo en `false`.
6. Consentimiento (opt-in): el salón debe informar que escribirá por WhatsApp. "BAJA" ya desactiva los avisos proactivos.

**Costo:** cada plantilla que abre conversación se cobra según la tarifa de Meta para RD/LATAM. Las respuestas dentro de la ventana de 24 h que abre el cliente no se cobran como plantilla. El límite por minuto está en `config/business.json` → `messaging.maxPerMinute`.

## D3. Google Calendar (sync bidireccional)

**Necesitas:** un proyecto de Google Cloud y un dominio verificado en Search Console (para la pantalla de consentimiento y el webhook).

1. Habilita Google Calendar API.
2. Configura la pantalla de consentimiento OAuth:
   - tipo externo
   - scope `https://www.googleapis.com/auth/calendar.events`
   - enlaces a política de privacidad y términos
3. **Verificación de la app.** El scope es *sensible*: Google exige revisión, que tarda de días a semanas. Mientras tanto, el modo "Testing" admite hasta 100 usuarios de prueba, suficiente para el piloto.
4. Crea las credenciales OAuth (Web) con redirect `https://TU-DOMINIO/api/calendar/google/callback`. Secretos:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `GOOGLE_REDIRECT_URI`
   - `GOOGLE_WEBHOOK_URL=https://TU-DOMINIO/api/webhooks/google-calendar`

   Variable: `CALENDAR_PROVIDER=google`.
5. Cada barbero entra a `/barbero` y pulsa **Conectar Google Calendar**.
6. Los canales `watch` vencen (unos 7 días). El cron de calendario cada 30 min hace sync incremental como red de seguridad. Renovar los canales automáticamente queda en el backlog.

**Re-evaluar** (decisión del dueño, 2026-10-02): si la verificación de Google se complica, el plan B es solo exportar un feed iCal de lectura, sin OAuth.

## D4. Claude como respaldo del intérprete

1. Crea una API key en console.anthropic.com y fija un **límite de gasto mensual** en la consola.
2. Secreto `ANTHROPIC_API_KEY`. Variable `LLM_PROVIDER=claude`.
3. El modelo por defecto es `claude-opus-5-5` (`CLAUDE_MODEL`). Solo se llama cuando las reglas tienen confianza < 0.5, y el prompt está en `prompts/claude/v1/`.
4. Revisa los logs (`source: "claude"`) la primera semana. Si un patrón se repite, agrégalo a las reglas: es gratis y más rápido.

## D5. Datos del salón piloto y legal

1. **Historial:** pide al salón un Excel o CSV con las columnas `cliente, telefono, fecha, hora, servicio, barbero, precio, estado`. Luego:
   ```bash
   npm run import:csv -- historial.csv          # dry-run: muestra errores por línea
   npm run import:csv -- historial.csv --apply  # guarda
   ```
   Con 3 a 6 meses de historial, cada cliente ya tiene su ciclo real desde el día uno.
2. **Legal (RD):** política de privacidad conforme a la Ley 172-13 de protección de datos personales:
   - qué datos se guardan (nombre, teléfono, historial de citas)
   - para qué se usan
   - cómo pedir baja o borrado
3. Términos de servicio del SaaS. Fuera de alcance por ahora: pagos y facturación.
4. **Onboarding:** configura horarios y especialidades en Ajustes, conecta los calendarios y luego deja 1 semana en modo "relleno automático" con `MESSAGING_DRY_RUN=true` para revisar qué habría enviado.

---

## Checklist P0 antes de abrir a clientes

| Ítem | Estado en el código |
|---|---|
| Validación de esquema en cada frontera | ✅ zod en API, webhooks, salida de NLU/Claude, filas de BD |
| Guardas en código, no solo en prompts | ✅ baja, horas de silencio, límite por minuto, dry-run, TTL de ofertas, cooldown |
| Logging con contexto de negocio | ✅ logger JSON con salón, cliente, cita y motivo; secretos redactados |
| Idempotencia | ✅ wamid único, un hueco por cancelación, oferta única por cliente y hueco, CAS en estados |
| Credenciales solo en env | ✅ `.env.example` y secretos de Wrangler |
| Timeouts en APIs externas | ✅ WhatsApp, Google, Supabase y Claude |
| Reintentos con backoff | ✅ WhatsApp (429/5xx); Claude (SDK) |
| Autenticación y autorización | ✅ enlace mágico, membresía del salón por request, RLS por `salon_id` |
| Doble reserva imposible | ✅ exclusion constraint en Postgres y compare-and-set en memoria |
| Tests con datos reales anonimizados | ⏳ D5: agregar al corpus frases reales del salón piloto |
