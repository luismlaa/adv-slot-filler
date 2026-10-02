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
- [ ] Esquemas zod (Salon, Staff, Service, Client, Appointment, Block, Waitlist, Gap, Offer, Nudge, Message)
- [ ] Motor de slots (horarios, descansos, buffers, granularidad, tz)
- [ ] Motor de asignación (especialidad, alternativas, balanceo, fragmentación) + tests

## F2 — Ciclos + relleno + métricas · `feat/f2-cycles-gapfill`
- [ ] `cycles/` estimador robusto + estados + tests con patrones sintéticos
- [ ] `gapfill/` candidatos, olas, TTL, first-accept-wins + tests
- [ ] `metrics/` ROI + tests

## F3 — Persistencia · `feat/f3-persistence`
- [ ] Ports + adaptador memory + seed determinista "Barbería El Clásico"
- [ ] Migraciones Supabase (RLS, exclusion constraint) + adaptador supabase
- [ ] Importador CSV

## F4 — Conversación + mensajería · `feat/f4-conversation`
- [ ] Parser NLU ES (≥40 frases) + máquina de diálogo
- [ ] LLMProvider rules | claude (prompt versionado)
- [ ] MessagingChannel simulator | WhatsApp Cloud (fixtures)

## F5 — UI salón · `feat/f5-salon-ui`
- [ ] Agenda por columnas en vivo, huecos, cancelar → relleno
- [ ] Por volver, lista de espera, métricas ROI, ajustes

## F6 — Barbero móvil + calendario · `feat/f6-barber-calendar`
- [ ] Vista "Mi día" + bloqueos
- [ ] Sync bidireccional (fake + Google) + tests

## F7 — Demo de pitch · `feat/f7-demo`
- [ ] `/demo` split + reloj simulado + director de escenarios + reset
- [ ] Playwright del guion + `docs/pitch-script.md`

## F8 — Endurecimiento · `feat/f8-hardening`
- [ ] Logging, timeouts/reintentos, rate limit, dry-run, healthcheck, CI, a11y, checklist P0

## Paralelizable con subagentes
- F1 esquemas ↔ F3 migraciones (una vez fijado el modelo)
- F4 parser ↔ F5 UI (una vez fijados los ports)

## Review
_(se completa al cerrar cada fase)_
