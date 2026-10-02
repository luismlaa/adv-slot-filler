# Slot Filler

Slot Filler es la agenda que llena sola las sillas de una barbería o salón. Hace tres cosas:

- **Reparte** cada reserva entre los estilistas según su especialidad y la carga de su día.
- **Rellena los huecos** cuando alguien cancela: le ofrece el espacio por WhatsApp a la lista de espera y a los clientes a los que ya les toca volver.
- **Recuerda a cada cliente en su ciclo real.** Aprende cada cuánto viene ("cada 3 semanas con Carlos") y lo invita justo a tiempo, en vez de mandar un recordatorio genérico.

El cliente escribe por WhatsApp como habla ("quiero pelarme con Carlos el sábado en la tarde"). El salón ve un tablero por estilista que se reacomoda en vivo.

## Demo de pitch (offline, sin cuentas ni costos)

```bash
npm install
cp .env.example .env
npm run demo
```

Rutas:

- **http://localhost:4100/agenda**: el producto tal cual lo usa el salón, con datos seed. La tecla «.» abre el panel del presentador (reloj simulado, saltos de ciclo, calendario de Carlos, reinicio).
- **http://localhost:4100/chat**: el WhatsApp del cliente. Lo que escribes entra igual que un webhook real y el agente responde como en producción. Ábrelo en el celular para el pitch (`docs/pitch-script.md`).
- `/agenda`: tablero del salón.
- `/por-volver`, `/lista-espera`, `/metricas` y `/ajustes`: el resto del panel del salón.
- `/barbero`: vista móvil del estilista.

El guion paso a paso está en [`docs/pitch-script.md`](docs/pitch-script.md).

## Desarrollo

```bash
npm run check        # typecheck + lint + tests unitarios
npm run e2e          # Playwright recorre el guion de pitch completo (build de producción, offline)
npm run cf:preview   # build para Cloudflare Workers y vista local con wrangler
npm run db:seed      # carga el salón de demo en un Supabase (local o staging)
npm run import:csv -- historial.csv   # importa el historial real de un salón (dry-run por defecto)
```

Stack: Next.js 16 y TypeScript strict. Los datos van en Supabase (Postgres, Auth y Realtime) y el hosting en Cloudflare Workers, ambos en capa gratuita con uso comercial permitido.

La arquitectura y las reglas del proyecto están en [`CLAUDE.md`](CLAUDE.md). Lo que falta para producción (WhatsApp, Google Calendar, Supabase cloud, Claude, datos y legal) está en [`docs/deploy-phases.md`](docs/deploy-phases.md).
