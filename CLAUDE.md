@AGENTS.md

# Slot Filler

> Agenda inteligente para barberías y salones (LATAM/RD): reparte reservas por especialidad, rellena huecos con lista de espera y trae a cada cliente en su ciclo real.
> Category: web-app (con agente conversacional de reservas) · Stack: Next.js 16 + TypeScript strict + Supabase · Owner: Luis Landa

---

## ⚡ Operating System — Workflow Orchestration

1. **Plan Mode Default** — Enter plan mode for ANY non-trivial task (3+ steps or an architectural decision). Write the spec upfront. If something goes sideways mid-task, STOP and re-plan.
2. **Subagent Strategy** — Use subagents to keep the main context clean: research, exploration, parallel analysis. One task per subagent.
3. **Self-Improvement Loop** — After ANY correction from the owner, capture the lesson in the memory vault and write a rule that prevents it. Review lessons at session start.
4. **Verification Before Done** — Never mark a task complete without proof: run tests, check logs, demonstrate it. Ask: *"Would a staff engineer approve this?"*
5. **Demand Elegance (Balanced)** — For non-trivial changes ask *"Is there a more elegant way?"* Skip for obvious fixes — don't over-engineer.
6. **Autonomous Bug Fixing** — Given a bug report, just fix it: logs, errors, failing tests → resolve them.

**🟠 Golden Rule:** Be proactive. Think like an owner. Act like a senior engineer. Never make me repeat myself.

---

## ✅ Task Management

1. **Plan First** — Write the plan to `tasks/todo.md` as checkable items before coding.
2. **Verify Plan** — Check in with the owner before starting implementation.
3. **Track Progress** — Mark items complete in `tasks/todo.md` as you go.
4. **Explain Changes** — High-level summary at each step.
5. **Document Results** — Add a review section to `tasks/todo.md` when done.
6. **Capture Lessons** — On any correction, record the lesson in the memory vault.
7. **Big builds → missions** — For multi-feature work the owner can run `/mission-control` (user-invoked only — never start one yourself).

---

## 🧠 Knowledge & Memory — read FIRST, it saves context

- **Memory vault (the *why*)** → `~/SecondBrain/projects/slot-filler/MEMORY.md`. Read it at the start of work: decisions, domain glossary, context, gotchas. New non-obvious learning → one-fact note under `decisions/`, `domain/`, `context/` or `reference/`, `[[wikilinks]]`, pointer line in `MEMORY.md`.
- **Code graph (the *what connects to what*)** → Graphify. For "where is X used / how does this flow" run `/graphify query "…"` FIRST instead of reading files. Refresh with `/graphify . --update` after structural changes. `graphify-out/` is gitignored — regenerate with `/graphify . --obsidian`.

Rule of thumb: **code/architecture question → graphify first. "Why / plan / term" → vault first.**

---

## 🔌 Skill Discovery (don't over-do it)

Before hand-rolling a common capability, check `npx skills find <query>` / **find-skills**; install with `npx skills add <owner/repo@skill> -g -y`. Only when a capability is *clearly missing*.

---

## 🌿 Git & Parallelization

- **`main` is trunk and stays releasable.** Never commit to `main` directly.
- One unit of work → one branch (`feat/`, `fix/`, `chore/`, `refactor/<slug>`) → one focused PR. PR body = what/why + test plan + acceptance criteria. **A human merges** after tests are green. Pre-build phases are stacked branches (`feat/f0-…` → `feat/f1-…` → …); merge them in order.
- Mode: **single-instance** — one session, subagents for fan-out, one writer to the working tree. If work is ever split across sessions, use one git worktree per task: `git worktree add ../slot-filler-wt/<slug> -b feat/<slug>` with disjoint file ownership.
- `*-wt/` and `.worktrees/` are gitignored.

---

## Build & Run
- `npm install`
- `cp .env.example .env` (defaults = demo offline; no keys needed)
- `npm run demo` → http://localhost:4100/demo (pitch) · `/agenda` (salón) · `/barbero` (móvil)
- Supabase local (optional, Docker): `npx supabase start -x studio,storage-api,imgproxy,mailpit,edge-runtime,logflare,vector,supavisor,postgres-meta` (API on :55321, DB on :55322) then `DATA_BACKEND=supabase`

## Test
- `npm run check` (typecheck + lint + unit) · `npm run e2e` (Playwright, runs the pitch script offline)
- `npm run test:integration` (Supabase adapter; skips without `NEXT_PUBLIC_SUPABASE_URL`)

## Architecture (hexagonal)
- `src/domain/` — pure TS, no I/O: `model` (zod), `time` (slots, tz), `allocation` (specialty rules + load balancing), `gapfill` (waves, TTL, first-accept-wins), `cycles` (per-client recurrence), `conversation` (dialog state machine), `metrics` (ROI).
- `src/nlu/` — Spanish (Dominican) intent parser; `LLMProvider` = `rules` (default, free) | `claude` (fallback for low-confidence messages).
- `src/ports/` — interfaces: `Store`, `EventBus`, `MessagingChannel`, `CalendarProvider`, `Clock`, `Logger`.
- `src/adapters/` — `memory` (demo seed), `supabase`, `whatsapp` (simulator | Meta Cloud API), `calendar` (fake | Google), `llm` (Claude).
- `src/services/` — use cases orchestrating domain + ports; `src/app/` — Next.js UI + route handlers; `src/lib/container.ts` wires adapters from env.
- Business rules live in `config/business.json` (+ per-salon overrides), validated by `src/config/business.ts`; env via `src/config/env.ts`.
- Concurrency safety is compare-and-set at the port (`claimOffer`, `insertAppointmentIfFree`) + DB exclusion constraint — never read-then-write.

## Critical Rules
- NEVER commit secrets — everything sensitive lives in `.env` (`.env.example` lists every var).
- NEVER enable real sends (WhatsApp/Google/Claude) or deploy without explicit owner approval; deploy phases D1–D5 are in `docs/deploy-phases.md`.
- Validate all external input at the boundary (webhooks, NLU output, API bodies) with zod.
- Immutable data — domain functions return new objects, never mutate.
- Domain code never imports from `adapters/`, `app/`, or Node/Next APIs; time comes from the `Clock` port.
- All user-facing copy is Spanish (tú, neutral-dominicano); all dates in the salon timezone (`America/Santo_Domingo`).
- Logging carries business context: salonId, clientId, appointmentId, and *why* (decision reason).
- Many small files (200–400 lines, 800 hard max).

## Gotchas
- Next 16: async `params`/`searchParams`, `proxy.ts` replaces middleware — read `node_modules/next/dist/docs/` before using a Next API.
- The in-memory store is a `globalThis` singleton so all route handlers share one demo state.
- No `next/font/google`: the demo must run offline, so fonts are system stacks.
