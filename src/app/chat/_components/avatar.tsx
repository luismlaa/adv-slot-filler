const COLORS = ["#25d366", "#53bdeb", "#ffbc38", "#fc9775", "#a791ff", "#06cf9c"];

/** Inicial sobre color estable por nombre, como los contactos sin foto de WhatsApp. */
export function Avatar({ name, size = 48 }: { name: string; size?: number }) {
  const color = COLORS[[...name].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % COLORS.length];
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, background: color, fontSize: size * 0.42 }}
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}
