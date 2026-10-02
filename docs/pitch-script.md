# Guion de pitch: Slot Filler

Duración: 6 a 8 minutos. Funciona offline. Lo que se muestra **es el producto**: las mismas pantallas que usará el salón y el mismo WhatsApp que verá el cliente, con datos de una barbería ficticia. No hay botones de guion: todo pasa escribiendo como lo haría un cliente.

## Antes de la reunión (5 min)

1. Ejecuta `npm run demo`.
2. **Pantalla grande (el salón):** abre **http://localhost:4100/agenda** a pantalla completa.
3. **El cliente:** abre **http://localhost:4100/chat**.
   - Mejor en un celular conectado a la misma red: `http://<IP-de-tu-Mac>:4100/chat`.
   - Si no tienes celular, usa una ventana angosta al lado de la agenda.
4. En la agenda, pulsa la tecla **«.»** para abrir el panel del **presentador** y luego **↺ Reiniciar la demo**. Vuelve a pulsar «.» para ocultarlo.
5. Si no hay internet, no pasa nada: la demo no necesita red, cuentas ni claves.

**El panel del presentador.** Lo abre un punto casi invisible en la esquina inferior derecha, o la tecla «.». No forma parte del producto. Contiene:
- el reloj del salón: +1 hora, +1 día, +1 semana, +4 semanas o «ir a» una fecha;
- «Hasta que le toque volver a…», que salta al día en que a un cliente le toca su ciclo;
- el Google Calendar simulado de Carlos;
- el botón de reinicio.

## Apertura (30 s)

> "Una barbería de 5 sillas pierde plata de tres formas: el cliente que pide a su barbero y está lleno, la silla que queda vacía cuando alguien cancela, y el cliente fiel que deja de venir sin que nadie lo note. Slot Filler resuelve las tres solo, por WhatsApp."

## Escena 1: "Quiero corte con Carlos el sábado" (1 min)

1. En el chat, entra como **Pedro Martínez** y escribe: «Klk, quiero un corte con Carlos el sábado».
   - Aparece «escribiendo…» y el asistente responde que Carlos está lleno.
   - Ofrece alternativas: Carlos en el hueco más cercano, o Luis o Rafael, que también hacen fade.
   > "No le dice 'no hay'. Entiende cómo habla el cliente, sabe quién tiene la especialidad y balancea la carga entre los barberos."
2. Toca la sugerencia **la 1**. En la agenda, la cita aparece en vivo y la actividad lo registra.

**Si preguntan:** "corte" se interpreta como el servicio habitual de Pedro (fade), según su historial.

## Escena 2: Alguien cancela y el hueco se rellena solo (1 min 30 s)

1. Vuelve a los chats (flecha ←), entra como **Juan Pérez** y escribe: «Mano, no voy a poder ir el sábado».
   - El asistente pide confirmación. Toca **Sí, dale**.
2. En la agenda, ve al sábado (→):
   - El bloque de las 4:00 p. m. se pone ámbar: «⚡ Hueco por cancelación».
   - En la lista de chats, **José** ya tiene un mensaje nuevo arriba: la oferta.
   > "La oferta sale primero a quien estaba en lista de espera para ese día y barbero, y luego a clientes a los que ya les toca volver. Vence en 15 minutos."
3. Entra como **José** y responde «Sí!! Dame ese». En la agenda, el hueco se vuelve cita con «✨ Hueco rellenado».
   > "Nadie en el salón tocó nada. Si dos clientes dicen que sí a la vez, solo uno se queda con el espacio: está garantizado a nivel de base de datos."

## Escena 3: "Ya van 4 semanas, ¿te aparto?" (1 min 30 s)

1. Presentador («.») → **Hasta que le toque volver a: Pedro Martínez → Ir**.
   - El reloj salta a esa mañana y la actividad muestra las invitaciones de regreso enviadas.
2. Abre el chat de **Pedro**. Le llegó: «Ya van 4 semanas de tu último fade con Carlos. ¿Te aparto con Carlos…?».
   > "No es un recordatorio genérico. Pedro viene cada 28 días, José cada 21 y Ana cada 6 semanas. El sistema aprende el ciclo real de cada cliente, ignora las vacaciones y lo invita justo cuando le toca, con un espacio concreto con su barbero."
3. Toca **Sí, dale**. En la agenda, la cita aparece con «🔁 Volvió por su ciclo».
4. Opcional: abre **Por volver** para mostrar a quién le toca esta semana y quién está en riesgo de perderse.

## Escena 4: Se monta en el calendario del barbero (45 s)

1. En el panel del presentador, en el «Google Calendar de Carlos», agrega un evento personal (por ejemplo «Cita médica» a las 3:00 p. m.).
2. En la agenda, ese tiempo queda bloqueado.
   > "Carlos sigue usando su Google Calendar. Sus citas de Slot Filler aparecen allá y lo personal bloquea la agenda acá."
3. Opcional: abre **/barbero** en el celular para mostrar la vista "Mi día" del barbero.

## Escena 5: El retorno en pesos (1 min)

1. Abre **Métricas**.
   - «Ingresos recuperados en 30 días»: la suma de huecos rellenados y clientes que volvieron por su invitación.
   - Los huecos rellenados, cuánto tardó cada uno y la conversión de las invitaciones.
   > "Solo cuenta plata que no existiría sin el sistema."

## Cierre (30 s)

> "Todo esto ya está construido. Para salir a producción solo falta lo que depende de ustedes: verificar el WhatsApp del negocio, conectar los calendarios y cargar su historial de clientes, que importamos desde un Excel."

## Improvisar

Escribe en el chat como cualquier cliente. Las sugerencias de abajo cambian según la conversación. Algunos ejemplos:
- «¿cuánto cuesta el fade?», «precios»
- «¿a qué hora abren?», «¿dónde queda?»
- «qué tienen libre el sábado en la tarde?», «quiero pelarme con lucho pasado mañana a las 3»
- «avísame si se libera algo», «cancelar», «BAJA»

**Cliente nuevo** es un número que nunca escribió: se crea solo.

Con `LLM_PROVIDER=claude` y una `ANTHROPIC_API_KEY`, los mensajes que las reglas no entienden los interpreta Claude. Sin red, cae a las reglas sin errores.

En la agenda:
- clic en una cita para cancelarla desde el salón y ver el relleno;
- clic en un espacio «Libre» para reservar.

## Si algo sale mal

- «.» → **↺ Reiniciar la demo** y retoma desde la escena que ibas. Cada escena funciona sola.
- Si una página se ve rara, recárgala (Cmd+R): el estado vive en el servidor, no se pierde nada.
