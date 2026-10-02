import type { AllocationReason } from "../allocation";
import type { LocalDate, Service, Staff } from "../model";
import { localParts } from "../time";
import { endSentence, firstNameOf, formatDay, formatTime, formatWhen, optionMarker } from "./format";
import type { ConversationState } from "./state";

type Option = Extract<ConversationState, { step: "choosing" }>["options"][number];

export interface CopyContext {
  readonly salonName: string;
  readonly timezone: string;
  readonly today: LocalDate;
  readonly staff: readonly Staff[];
  readonly services: readonly Service[];
}

const staffName = (ctx: CopyContext, id: string) => firstNameOf(ctx.staff.find((s) => s.id === id)?.name ?? "tu barbero");
const serviceName = (ctx: CopyContext, id: string) => (ctx.services.find((s) => s.id === id)?.name ?? "servicio").toLowerCase();

/** Lista numerada de opciones; compacta si todas son del mismo estilista y día. */
export function optionLines(ctx: CopyContext, options: readonly Option[]): string {
  const sameStaff = options.every((o) => o.staffId === options[0]!.staffId);
  const sameDay = options.every((o) => localParts(Date.parse(o.start), ctx.timezone).date === localParts(Date.parse(options[0]!.start), ctx.timezone).date);
  return options
    .map((o, i) => {
      const parts = localParts(Date.parse(o.start), ctx.timezone);
      const when = sameDay ? formatTime(parts.time) : `${formatDay(parts.date, ctx.today)}, ${formatTime(parts.time)}`;
      const who = sameStaff ? "" : `${staffName(ctx, o.staffId)} · `;
      return `${optionMarker(i)} ${who}${when}`;
    })
    .join("\n");
}

export function availableMessage(ctx: CopyContext, options: readonly Option[], note?: string): string {
  const first = options[0]!;
  const sameStaff = options.every((o) => o.staffId === first.staffId);
  const sameDay = options.every((o) => localParts(Date.parse(o.start), ctx.timezone).date === localParts(Date.parse(first.start), ctx.timezone).date);
  const day = formatDay(localParts(Date.parse(first.start), ctx.timezone).date, ctx.today);
  const header = sameStaff
    ? `${staffName(ctx, first.staffId)} tiene libre${sameDay ? ` ${day}` : ""} para tu ${serviceName(ctx, first.serviceId)}:`
    : `Tengo estos espacios${sameDay ? ` ${day}` : ""} para tu ${serviceName(ctx, first.serviceId)}:`;
  return `${note ? `${note}\n\n` : ""}${header}\n${optionLines(ctx, options)}\n\n¿Cuál te aparto? Responde con el número.`;
}

export function alternativesMessage(ctx: CopyContext, reason: AllocationReason | undefined, request: { staffId?: string; date?: LocalDate }, options: readonly Option[]): string {
  const who = request.staffId ? staffName(ctx, request.staffId) : undefined;
  const day = request.date ? formatDay(request.date, ctx.today) : undefined;
  const opener =
    reason === "staff_full" && who
      ? `${who} está lleno ${day ?? "ese día"} 😕`
      : reason === "staff_off" && who
        ? `${who} no trabaja ${day ?? "ese día"} 😕`
        : reason === "time_taken"
          ? "Esa hora ya está ocupada 😕"
          : reason === "staff_lacks_specialty" && who
            ? `${who} no hace ese servicio, pero te consigo con alguien que sí.`
            : "No me queda espacio justo como lo pediste 😕";
  const lines = options.map((o, i) => {
    const sameRequested = o.staffId === request.staffId;
    const label = sameRequested ? `${staffName(ctx, o.staffId)} (lo más cercano)` : `${staffName(ctx, o.staffId)}${request.staffId ? " (también lo hace)" : ""}`;
    return `${optionMarker(i)} ${label} — ${formatWhen(o.start, ctx.timezone, ctx.today)}`;
  });
  return `${opener} Te puedo ofrecer:\n${lines.join("\n")}\n\n¿Cuál te aparto? Si ninguna te sirve, te anoto en lista de espera y te aviso si se libera algo.`;
}

export const confirmationMessage = (ctx: CopyContext, o: { staffId: string; serviceId: string; start: string }) =>
  `Listo ✅ ${endSentence(`${capitalize(serviceName(ctx, o.serviceId))} con ${staffName(ctx, o.staffId)} ${formatWhen(o.start, ctx.timezone, ctx.today)}`)} Te esperamos en ${ctx.salonName} 💈\nSi no puedes venir, escríbeme «cancelar» y le damos el espacio a otro cliente.`;

export const offerMessage = (ctx: CopyContext, name: string, o: { staffId: string; serviceId: string; start: string }, ttlMinutes: number) =>
  `¡Hola ${firstNameOf(name)}! 🔔 Se liberó un espacio con ${staffName(ctx, o.staffId)} ${formatWhen(o.start, ctx.timezone, ctx.today)} para tu ${serviceName(ctx, o.serviceId)}. ¿Lo quieres? Responde *SÍ* en los próximos ${ttlMinutes} minutos y es tuyo.`;

export function reactivationMessage(
  ctx: CopyContext,
  name: string,
  daysSinceLast: number,
  lastStaffId: string,
  serviceId: string,
  options: readonly Option[],
): string {
  const weeks = Math.round(daysSinceLast / 7);
  const elapsed = weeks >= 2 ? `${weeks} semanas` : `${daysSinceLast} días`;
  const [first, ...rest] = options;
  const proposal = first ? ` ¿Te aparto con ${staffName(ctx, first.staffId)} ${formatWhen(first.start, ctx.timezone, ctx.today)}?` : " ¿Te aparto un turno?";
  const others = rest.length > 0 ? ` ${endSentence(`También tengo ${rest.map((o) => formatWhen(o.start, ctx.timezone, ctx.today)).join(" o ")}`)}` : "";
  return `Hola ${firstNameOf(name)} 👋 Ya van ${elapsed} de tu último ${serviceName(ctx, serviceId)} con ${staffName(ctx, lastStaffId)}.${proposal}${others}\nResponde *SÍ*, dime otra hora, o escribe BAJA si no quieres estos avisos.`;
}

export const cancelConfirmQuestion = (ctx: CopyContext, o: { staffId: string; serviceId: string; start: string }) =>
  `¿Confirmas que cancelamos tu ${serviceName(ctx, o.serviceId)} con ${staffName(ctx, o.staffId)} ${formatWhen(o.start, ctx.timezone, ctx.today)}? Responde SÍ o NO.`;

export const cancelledMessage = (ctx: CopyContext, o: { staffId: string; start: string }) =>
  `Listo, cancelé tu cita con ${endSentence(`${staffName(ctx, o.staffId)} ${formatWhen(o.start, ctx.timezone, ctx.today)}`)} ¡Gracias por avisar! Le daremos el espacio a alguien en lista de espera. Cuando quieras volver, escríbeme 💈`;

export const helpMessage = (ctx: CopyContext, name?: string) =>
  `¡Hola${name ? ` ${firstNameOf(name)}` : ""}! 👋 Soy el asistente de ${ctx.salonName}. Te puedo apartar una cita, decirte qué hay libre o cancelar.\nEscríbeme como hablas, por ejemplo: «quiero un fade con ${staffName(ctx, ctx.staff[0]?.id ?? "")} el sábado en la tarde».`;

export const MESSAGES = {
  unknown: "Disculpa, no te entendí bien 🙏 Puedes escribirme algo como «quiero un corte mañana en la tarde» o «cancelar mi cita».",
  askService: (ctx: CopyContext) =>
    `¿Qué te vas a hacer? Tenemos: ${ctx.services.filter((s) => s.active).map((s) => s.name.toLowerCase()).join(", ")}.`,
  askWhich: "¿Cuál de las opciones prefieres? Respóndeme con el número 🙂",
  declined: "Sin problema 👍 Si quieres otro día u hora, dímelo y te busco espacio.",
  waitlistJoined: (ctx: CopyContext, staffId: string | undefined, day: string | undefined) =>
    `Listo, te anoté en lista de espera${staffId ? ` con ${staffName(ctx, staffId)}` : ""}${day ? ` para ${day}` : ""}. Te escribo apenas se libere un espacio 🔔`,
  taken: "Ay, ese espacio lo acaba de tomar otra persona 😕 Te sigo avisando si se libera otro.",
  offerExpired: "Esa oferta ya venció ⏱️ Si quieres, dime qué día te sirve y te busco espacio.",
  noUpcoming: "No veo ninguna cita pendiente a tu nombre. ¿Quieres apartar una?",
  keepAppointment: "Perfecto, tu cita sigue en pie 👍",
  optedOut: "Listo, no te enviaremos más avisos. Si cambias de opinión, escribe ALTA. Igual puedes escribirnos para reservar cuando quieras.",
  optedIn: "¡Bienvenido de vuelta! Te volveremos a avisar cuando te toque 💈",
  thanks: "¡A la orden! 💈",
  askWaitlist: "Entiendo. ¿Quieres que te anote en lista de espera? Si alguien cancela, te escribo primero 🔔",
  nothingAvailable: "No encontré espacio en los próximos días para eso 😕 ¿Quieres que te anote en lista de espera?",
} as const;

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
