import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, operatorEmail, operatorName } from "@/components/legal/legal-page";
import { getEnv } from "@/config/env";

export const metadata: Metadata = { title: "Términos del servicio · Slot Filler" };
// Lee el operador (LEGAL_*) en runtime: el mismo build sirve a staging y producción.
export const dynamic = "force-dynamic";

/** Términos del servicio para los salones que contratan Slot Filler. */
export default function TermsPage() {
  const env = getEnv();
  const operator = { name: env.LEGAL_ENTITY_NAME, email: env.LEGAL_CONTACT_EMAIL };
  const who = operatorName(operator.name);
  return (
    <LegalPage title="Términos del servicio" updated="3 de octubre de 2026" operator={operator}>
      <p>
        Estos términos regulan el uso de Slot Filler, el servicio de agenda inteligente que {who} ofrece a barberías y salones (el «salón»). Al
        usar el servicio, el salón los acepta.
      </p>

      <h2>El servicio</h2>
      <p>
        Slot Filler gestiona la agenda del salón, responde por WhatsApp a sus clientes para reservar, mover o cancelar citas, ofrece los espacios
        liberados a la lista de espera e invita a los clientes a volver según su ciclo. Las condiciones comerciales (precio, plazo y forma de
        pago) se acuerdan por separado con cada salón.
      </p>

      <h2>Obligaciones del salón</h2>
      <ul>
        <li>Tener la base legal para tratar los datos de sus clientes, e informarles que les escribirá por WhatsApp.</li>
        <li>Cumplir las políticas de WhatsApp Business de Meta para el número que use.</li>
        <li>Mantener al día su catálogo, sus horarios y los accesos de su personal, y custodiar esos accesos.</li>
        <li>No usar el servicio para enviar publicidad no solicitada ni contenido ilícito.</li>
      </ul>

      <h2>Automatización</h2>
      <p>
        El salón decide qué automatizaciones activa (relleno de huecos, invitaciones por ciclo) y sus límites (horario de silencio, máximo de
        mensajes) en Ajustes. El asistente solo reserva dentro de los horarios y especialidades configurados. El salón es responsable de revisar
        su agenda.
      </p>

      <h2>Disponibilidad y soporte</h2>
      <p>
        Hacemos lo razonable para que el servicio esté disponible y para resolver incidencias con prontitud, pero puede haber interrupciones
        por mantenimiento o por fallas de proveedores (WhatsApp, Google, alojamiento). Hacemos respaldos diarios de la base de datos.
      </p>

      <h2>Datos</h2>
      <p>
        Los datos de los clientes son del salón. Los tratamos según la <Link href="/privacidad" className="underline">política de privacidad</Link>.
        Al terminar el servicio, el salón puede pedir una exportación de sus datos en los 30 días siguientes; después se eliminan.
      </p>

      <h2>Responsabilidad</h2>
      <p>
        Dentro de lo que permite la ley, {who} no responde por lucro cesante ni por daños indirectos. Su responsabilidad total se limita a lo que
        el salón haya pagado por el servicio en los últimos tres meses.
      </p>

      <h2>Ley aplicable</h2>
      <p>Estos términos se rigen por las leyes de la República Dominicana. Cualquier disputa se somete a los tribunales de Santo Domingo.</p>

      <h2>Contacto</h2>
      <p>{operatorEmail(operator.email)}</p>
    </LegalPage>
  );
}
