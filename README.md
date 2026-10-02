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

- **http://localhost:3000/demo**: guion de pitch en pantalla dividida (salón + WhatsApp simulado), con reloj simulado y escenarios guiados.
- `/agenda`: tablero del salón.
- `/por-volver`, `/lista-espera`, `/metricas` y `/ajustes`: el resto del panel del salón.
- `/barbero`: vista móvil del estilista.

El guion paso a paso está en [`docs/pitch-script.md`](docs/pitch-script.md).

## Desarrollo

```bash
npm run check   # typecheck + lint + tests unitarios
npm run e2e     # Playwright recorre el guion de pitch completo
```

La arquitectura y las reglas del proyecto están en [`CLAUDE.md`](CLAUDE.md). Lo que falta para producción (WhatsApp, Google Calendar, Supabase cloud, Claude, datos y legal) está en [`docs/deploy-phases.md`](docs/deploy-phases.md).
