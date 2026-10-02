# Guion de pitch: Slot Filler

Duración: 6 a 8 minutos. Funciona offline. Lo que se muestra es el producto real, no un mockup: es el mismo código que irá a producción, con datos de una barbería ficticia y un teléfono simulado.

## Antes de la reunión (5 min)

1. Ejecuta `npm run demo` y abre **http://localhost:4100/demo** a pantalla completa (la vista está pensada para 1440 px o más).
2. Pulsa **↺ Reiniciar** para dejar la demo en su estado inicial. Los datos son siempre los mismos: el seed es determinista.
3. Ten **/metricas** abierto en otra pestaña para la escena 5.
4. Si no hay internet, no pasa nada: la demo no necesita red, cuentas ni claves.

**Elementos en pantalla:**
- **Izquierda:** el guion (5 escenas, un botón por paso), el Google Calendar de Carlos y la actividad en vivo.
- **Centro:** el tablero del salón, con una columna por barbero.
- **Derecha:** el WhatsApp del cliente. Las pestañas cambian de teléfono (Pedro, José, Ana, Juan o un número nuevo).

## Apertura (30 s)

> "Una barbería de 5 sillas pierde plata de tres formas: el cliente que pide a su barbero y está lleno, la silla que queda vacía cuando alguien cancela, y el cliente fiel que deja de venir sin que nadie lo note. Slot Filler resuelve las tres solo, por WhatsApp."

## Escena 1: "Quiero corte con Carlos el sábado" (1 min)

1. Pulsa **Pedro escribe**.
   - El teléfono muestra: «Klk, quiero un corte con Carlos el sábado».
   - El tablero salta al sábado: la columna de Carlos está llena.
   - El asistente responde con alternativas: Carlos en el hueco más cercano, o Luis o Rafael, que también hacen fade, el sábado.
   > "No le dice 'no hay'. Entiende cómo habla el cliente, sabe quién tiene la especialidad y balancea la carga entre los barberos."
2. Pulsa **Pedro elige la 1**. La cita aparece en el tablero en vivo.

**Si preguntan:** "corte" se interpreta como el servicio habitual de Pedro (fade), según su historial.

## Escena 2: Alguien cancela y el hueco se rellena solo (1 min 30 s)

1. Pulsa **Juan avisa**. Juan escribe que no puede ir y el asistente le pide confirmación.
2. Pulsa **Juan confirma**.
   - En el tablero, el bloque del sábado a las 4:00 p. m. se pone ámbar: "⚡ Hueco por cancelación · Ola 1: José, …".
   - El teléfono cambia solo a José, que recibe la oferta.
   > "La oferta sale primero a quien estaba en lista de espera para ese día y barbero, y luego a clientes a los que ya les toca volver. Vence en 15 minutos."
3. Pulsa **José acepta**. El hueco se vuelve una cita con la insignia "✨ Hueco rellenado".
   > "Nadie en el salón tocó nada. Si dos clientes dicen que sí a la vez, solo uno se queda con el espacio: está garantizado a nivel de base de datos."

## Escena 3: "Ya van 4 semanas, ¿te aparto?" (1 min 30 s)

1. Pulsa **Avanzar 4 semanas**. El reloj de arriba salta casi un mes.
   - El feed dice: "Invitaciones de regreso enviadas a N clientes según su ciclo".
   - Pedro recibe: «Ya van 4 semanas de tu último fade con Carlos. ¿Te aparto con Carlos hoy a las …?».
   > "Esto no es un recordatorio genérico. Pedro viene cada 28 días, José cada 21 y Ana cada 6 semanas. El sistema aprende el ciclo real de cada cliente de su historial, ignora las vacaciones y lo invita justo cuando le toca, con un espacio concreto con su barbero."
2. Pulsa **Pedro dice sí**. La cita aparece en el tablero con "🔁 Volvió por su ciclo".
3. Opcional: abre **Por volver** (enlace "Panel completo ↗") para mostrar a quién le toca esta semana, con la confianza de cada patrón y los clientes en riesgo de perderse.

## Escena 4: Se monta en el calendario del barbero (45 s)

1. Pulsa **Carlos agenda algo personal**.
   - En el panel "Google Calendar de Carlos" aparece «Cita médica».
   - En el tablero, ese tiempo queda bloqueado.
   > "Carlos sigue usando su Google Calendar. Sus citas de Slot Filler aparecen allá y lo personal bloquea la agenda acá. El producto se monta en el flujo del salón, no al revés."
2. También puedes escribir tu propio evento en el panel y pulsar "+ Evento personal".

## Escena 5: El retorno en pesos (1 min)

1. Abre **/metricas**.
   - "Ingresos recuperados en 30 días": la suma de huecos rellenados y clientes que volvieron por su invitación.
   - Huecos rellenados y tiempo medio para rellenarlos.
   - Conversión de las invitaciones y ocupación por estilista.
   > "Solo cuenta plata que no existiría sin el sistema."

## Cierre (30 s)

> "Todo esto ya está construido. Para salir a producción solo falta lo que depende de ustedes: verificar el WhatsApp del negocio, conectar los calendarios y cargar su historial de clientes, que importamos desde un Excel."

## Improvisar

- Escribe en el teléfono como cualquier cliente. Por ejemplo, en la pestaña **Ana**: «qué tienen libre el sábado en la tarde?», «quiero pelarme con lucho pasado mañana a las 3», «avísame si se libera algo», «cancelar» o «BAJA».
- Para un cliente que nunca escribió, usa la pestaña **Cliente** (número nuevo): se crea solo.
- En el tablero, haz clic en una cita para cancelarla desde el salón y ver el relleno, o en un espacio "Libre" para reservar.
- **+1 hora / +1 día / +1 semana** avanzan el reloj: se cierran citas, vencen ofertas y salen invitaciones.

## Si algo sale mal

- Pulsa **↺ Reiniciar** y retoma desde la escena que ibas. Cada escena funciona sola, aunque la 3 es más redonda después de la 1.
- Si la página se ve rara, recárgala (Cmd+R): el estado vive en el servidor, no se pierde nada.
