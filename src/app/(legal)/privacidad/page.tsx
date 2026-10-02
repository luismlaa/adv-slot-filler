import type { Metadata } from "next";
import { LegalPage, operatorEmail, operatorName } from "@/components/legal/legal-page";
import { getEnv } from "@/config/env";

export const metadata: Metadata = { title: "Política de privacidad · Slot Filler" };
// Lee el operador (LEGAL_*) en runtime: el mismo build sirve a staging y producción.
export const dynamic = "force-dynamic";

/** Política de privacidad (Ley 172-13 de la República Dominicana). Requerida por Meta y Google. */
export default function PrivacyPage() {
  const env = getEnv();
  const operator = { name: env.LEGAL_ENTITY_NAME, email: env.LEGAL_CONTACT_EMAIL };
  const who = operatorName(operator.name);
  const email = operatorEmail(operator.email);
  return (
    <LegalPage title="Política de privacidad" updated="3 de octubre de 2026" operator={operator}>
      <p>
        Slot Filler es un servicio de agenda y mensajería para barberías y salones, operado por {who}. Esta política explica qué datos personales
        tratamos cuando un cliente le escribe a un salón por WhatsApp o cuando el personal del salón usa la plataforma, y cómo ejercer sus
        derechos según la Ley 172-13 de la República Dominicana sobre protección de datos de carácter personal.
      </p>

      <h2>Quién es responsable</h2>
      <p>
        Cada salón es el responsable de los datos de sus clientes y decide para qué los usa. {who} actúa como encargado del tratamiento: guarda y
        procesa esos datos por cuenta del salón, solo para prestar el servicio, y no los vende ni los usa para fines propios.
      </p>

      <h2>Qué datos tratamos</h2>
      <ul>
        <li>De los clientes del salón: nombre, número de WhatsApp, historial de citas (fecha, servicio, estilista, precio y estado), los mensajes intercambiados con el asistente del salón, la lista de espera y si pidió no recibir avisos.</li>
        <li>Del personal del salón: nombre, correo electrónico de acceso, horario y especialidades. Si un estilista conecta su Google Calendar, leemos sus eventos (hora y título) solo para bloquear ese tiempo en la agenda, y escribimos en su calendario las citas del salón.</li>
        <li>Datos técnicos mínimos (registros de acceso y errores) para operar y proteger el servicio.</li>
      </ul>

      <h2>Para qué los usamos</h2>
      <ul>
        <li>Reservar, mover y cancelar citas cuando el cliente lo pide por WhatsApp o en el salón.</li>
        <li>Avisar a clientes en lista de espera cuando se libera un espacio.</li>
        <li>Invitar a cada cliente a volver cuando le toca según su propio historial de visitas.</li>
        <li>Darle al salón métricas de ocupación y de ingresos recuperados.</li>
      </ul>
      <p>
        El salón debe informar a sus clientes que le escribirá por WhatsApp. El cliente puede escribir <strong>BAJA</strong> en cualquier momento
        y dejará de recibir avisos e invitaciones; seguirá pudiendo escribir para reservar. Para volver a recibirlos, escribe <strong>ALTA</strong>.
      </p>

      <h2>Con quién se comparten</h2>
      <p>Usamos proveedores que procesan datos por nuestra cuenta, con sus propias garantías de seguridad. Algunos están fuera de la República Dominicana (principalmente en Estados Unidos):</p>
      <ul>
        <li>Meta Platforms (WhatsApp Business): envío y recepción de mensajes.</li>
        <li>Supabase: base de datos y autenticación.</li>
        <li>Cloudflare: alojamiento de la aplicación.</li>
        <li>Google: solo si un estilista conecta su Google Calendar.</li>
        <li>Anthropic: si el salón lo activa, interpreta mensajes que el sistema no entiende por sí solo. Recibe el texto del mensaje y el catálogo de servicios, no el historial del cliente.</li>
      </ul>

      <h2>Cuánto tiempo los guardamos</h2>
      <p>
        Mientras el salón use el servicio. Si el salón se da de baja, o un cliente pide que se borren sus datos, se eliminan de la base activa en
        un plazo máximo de 30 días. Las copias de respaldo cifradas se conservan hasta 30 días adicionales y luego se destruyen.
      </p>

      <h2>Tus derechos</h2>
      <p>
        Puedes pedir acceso a tus datos, su rectificación, su cancelación (borrado) u oponerte a su tratamiento. Escríbele al salón o a{" "}
        <strong>{email}</strong> desde el número o correo de la cuenta. Responderemos en un máximo de 10 días hábiles. Si no quedas conforme,
        puedes acudir a las autoridades competentes de la República Dominicana.
      </p>

      <h2>Seguridad</h2>
      <p>
        Los datos viajan cifrados (HTTPS), cada salón solo puede ver los suyos (aislamiento en la base de datos), el acceso del personal es por
        invitación y las credenciales de los proveedores nunca se guardan en el código.
      </p>

      <h2>Cambios</h2>
      <p>Si cambiamos esta política, publicaremos la nueva versión aquí con su fecha.</p>
    </LegalPage>
  );
}
