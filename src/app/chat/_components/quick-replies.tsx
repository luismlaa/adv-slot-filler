/** Sugerencias según lo último que dijo el salón, para que el presentador escriba rápido. */
export function suggestionsFor(lastFromSalon: string | undefined): readonly string[] {
  const text = lastFromSalon ?? "";
  if (/1️⃣|¿Cuál te aparto/.test(text)) return ["la 1", "la 2", "ninguna me sirve"];
  if (/¿Confirmas|Responde \*SÍ\*|¿Lo quieres|¿Te aparto|¿Te lo aparto/i.test(text)) return ["Sí, dale", "No, gracias"];
  return ["Quiero un corte el sábado", "¿Cuánto cuesta el fade?", "¿A qué hora abren?", "No voy a poder ir"];
}

export function QuickReplies({ options, disabled, onPick }: { options: readonly string[]; disabled: boolean; onPick: (text: string) => void }) {
  return (
    <div className="mb-2 flex gap-2 overflow-x-auto pb-1" aria-label="Sugerencias">
      {options.map((text) => (
        <button
          key={text}
          type="button"
          disabled={disabled}
          onClick={() => onPick(text)}
          className="shrink-0 rounded-full border border-[#00a884]/40 bg-white px-3 py-1.5 text-sm text-[#008069] shadow-sm active:bg-[#e7fce3] disabled:opacity-50"
        >
          {text}
        </button>
      ))}
    </div>
  );
}
