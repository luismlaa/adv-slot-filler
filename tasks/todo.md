# Slot Filler — Plan pre-build

Plan aprobado: `~/.claude/plans/planifica-el-desarrollo-de-cached-blanket.md` (resumen aquí).
Modo: single-instance. Ramas apiladas por fase; merge humano en orden.

## F0 — Scaffold + capa de conocimiento · `feat/f0-scaffold`
- [x] create-next-app (TS strict, App Router, Tailwind 4) + zod, chrono-node, date-fns, vitest, Playwright
- [x] `.env.example` + loader tipado (`src/config/env.ts`) + config de negocio (`config/business.json`)
- [x] CLAUDE.md, README, `.gitignore` (graphify, worktrees, supabase)
- [x] Vault `~/SecondBrain/projects/slot-filler/` + puntero en HOME.md
- [x] Smoke test verde
- [x] graphify

## F1 — Dominio: modelo, tiempo, asignación · `feat/f1-domain-allocation`
- [x] Esquemas zod (Salon, Staff, Service, Client, Appointment, Block, Waitlist, Gap, Offer, Nudge, Message)
- [x] Motor de slots (horarios, descansos, buffers, granularidad, tz)
- [x] Motor de asignación (especialidad, alternativas, balanceo, fragmentación) + tests

## F2 — Ciclos + relleno + métricas · `feat/f2-cycles-gapfill`
- [x] `cycles/` estimador robusto + estados + tests con patrones sintéticos
- [x] `gapfill/` candidatos, olas, TTL, first-accept-wins + tests
- [x] `metrics/` ROI + tests

## F3 — Persistencia · `feat/f3-persistence`
- [x] Ports + adaptador memory + seed determinista "Barbería El Clásico"
- [x] Migraciones Supabase (RLS, exclusion constraint) + adaptador supabase
- [x] Importador CSV

## F4 — Conversación + mensajería · `feat/f4-conversation`
- [x] Parser NLU ES (≥40 frases) + máquina de diálogo
- [x] LLMProvider rules | claude (prompt versionado)
- [x] MessagingChannel simulator | WhatsApp Cloud (fixtures)

## F5 — UI salón · `feat/f5-salon-ui`
- [x] Agenda por columnas en vivo, huecos, cancelar → relleno
- [x] Por volver, lista de espera, métricas ROI, ajustes

## F6 — Barbero móvil + calendario · `feat/f6-barber-calendar`
- [x] Vista "Mi día" + bloqueos
- [x] Sync bidireccional (fake + Google) + tests

## F7 — Demo de pitch · `feat/f7-demo`
- [x] `/demo` split + reloj simulado + director de escenarios + reset
- [x] Playwright del guion + `docs/pitch-script.md`

## F8 — Endurecimiento · `feat/f8-hardening`
- [x] Logging, timeouts/reintentos, rate limit, dry-run, healthcheck, CI, a11y, checklist P0

## Paralelizable con subagentes
- F1 esquemas ↔ F3 migraciones (una vez fijado el modelo)
- F4 parser ↔ F5 UI (una vez fijados los ports)

## Review — 2026-10-02

**Estado:** pre-build completo, F0–F8 en ramas apiladas, sin merge (lo hace un humano en orden).

**Verificación:**
- `npm run check`: typecheck, lint y 190 tests unitarios/integración en verde.
- `npm run e2e`: 3 tests de Playwright sobre la build de producción, que recorren el guion completo offline.
- `npm run cf:build` compila para Workers; `wrangler dev` sirve health, tablero y guion en workerd.

**Desvíos del plan:**
- shadcn/ui no se usó: con primitivas propias en Tailwind bastó y hay menos dependencias.
- chrono-node se quitó: interpretaba mal "pasado mañana" y "a las 3"; ahora hay un parser propio.
- Hosting en Cloudflare Workers, no en Vercel Hobby: Hobby prohíbe el uso comercial (misma decisión que en Orbit).
- La UI en vivo en producción usa Supabase Realtime: el bus en memoria no cruza isolates de Workers.

**Pendiente (no verificable aquí):**
- El adaptador Supabase no se probó contra una BD real: Docker se quedó sin disco. El test de contrato está listo en `tests/integration`.
- Google OAuth, WhatsApp real y Claude real quedan para D2–D4; están probados con fixtures y fakes.

**Siguiente:** fases D1–D5 en `docs/deploy-phases.md`.

---

# Post pre-build — plan `~/.claude/plans/resume-tambien-incluye-un-luminous-metcalfe.md`

## PR1 — Demo = producto + chat WhatsApp · `feat/demo-product-parity`
- [x] `/demo` → `/agenda`; borrar director, demo-stage, phone-simulator, escenas
- [x] Panel presentador oculto (tecla `.`): reloj, reiniciar, abrir chat, calendario de Carlos
- [x] Ruta `/chat` estilo WhatsApp (selector de cliente, burbujas, ✓✓, escribiendo…, chips)
- [x] Copy más natural + intents del día a día (saludo, precios, horario, ubicación)
- [x] Claude de respaldo con caída a reglas y tope diario
- [x] e2e y unit reescritos; `docs/pitch-script.md`

## PR2 — Multi-tenant · `feat/multi-tenant`
- [x] Contexto por salón, auth por membresía, webhook por phone_number_id, crons por salón
- [x] Migración (slug, active, whatsapp_phone_number_id) + `salon:create` + test de aislamiento

## PR3 — Infra de deploy · `chore/deploy-readiness`
- [ ] Entornos staging/prod, CD, observabilidad, backups, páginas legales, runbook
