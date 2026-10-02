/** Burbuja de «escribiendo…» con tres puntos. */
export function TypingIndicator() {
  return (
    <div className="flex justify-start" aria-label="escribiendo…">
      <div className="relative rounded-lg rounded-tl-none bg-white px-3 py-3 shadow-sm">
        <Tail side="left" />
        <span className="flex gap-1">
          <span className="size-2 animate-bounce rounded-full bg-[#8696a0] [animation-delay:-0.3s]" />
          <span className="size-2 animate-bounce rounded-full bg-[#8696a0] [animation-delay:-0.15s]" />
          <span className="size-2 animate-bounce rounded-full bg-[#8696a0]" />
        </span>
      </div>
    </div>
  );
}

/** Colita de la burbuja (esquina superior), en el color de la burbuja. */
export function Tail({ side }: { side: "left" | "right" }) {
  return side === "left" ? (
    <svg viewBox="0 0 8 13" width="8" height="13" className="absolute -left-2 top-0 fill-white" aria-hidden>
      <path d="M1.533 2.568 8 11.193V0H2.812C1.042 0 .474 1.156 1.533 2.568z" />
    </svg>
  ) : (
    <svg viewBox="0 0 8 13" width="8" height="13" className="absolute -right-2 top-0 fill-[#d9fdd3]" aria-hidden>
      <path d="M6.467 2.568 0 11.193V0h5.188c1.77 0 2.338 1.156 1.279 2.568z" />
    </svg>
  );
}
