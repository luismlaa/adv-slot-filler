import { cx } from "@/components/ui/primitives";
import { labelAt } from "@/lib/client-format";
import { RichText } from "./rich-text";
import { Tail } from "./typing-indicator";

export interface ChatMessage {
  id: string;
  direction: "in" | "out";
  text: string;
  at: string;
}

/** Burbuja: el cliente (in) a la derecha en verde con ✓✓; el salón (out) a la izquierda en blanco. */
export function MessageBubble({ message, timezone, first }: { message: ChatMessage; timezone: string; first: boolean }) {
  const mine = message.direction === "in";
  return (
    <div className={cx("flex", mine ? "justify-end" : "justify-start", first ? "mt-2" : "mt-0.5")}>
      <div
        className={cx(
          "relative max-w-[85%] whitespace-pre-line rounded-lg px-2.5 pb-1.5 pt-1.5 text-[15px] leading-[1.35] shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]",
          mine ? "bg-[#d9fdd3]" : "bg-white",
          first && (mine ? "rounded-tr-none" : "rounded-tl-none"),
        )}
      >
        {first && <Tail side={mine ? "right" : "left"} />}
        <RichText text={message.text} />
        <span className="float-right ml-2 mt-1.5 flex translate-y-1 items-center gap-0.5 text-[11px] leading-none text-[#667781]">
          {labelAt(message.at, timezone)}
          {mine && (
            <svg viewBox="0 0 16 11" width="16" height="11" className="fill-[#53bdeb]" aria-label="Leído">
              <path d="M11.071.653a.457.457 0 0 0-.304-.102.493.493 0 0 0-.381.178l-6.19 7.636-2.405-2.272a.463.463 0 0 0-.336-.146.47.47 0 0 0-.343.146l-.311.31a.445.445 0 0 0-.14.337c0 .136.047.25.14.343l2.996 2.996a.724.724 0 0 0 .501.203.697.697 0 0 0 .546-.266l6.646-8.417a.497.497 0 0 0 .108-.299.441.441 0 0 0-.19-.374l-.337-.273zm-2.4 7.636-.47-.442-.762.94.93.89a.724.724 0 0 0 .501.203.697.697 0 0 0 .546-.266l6.646-8.417a.497.497 0 0 0 .108-.299.441.441 0 0 0-.19-.374l-.337-.273a.457.457 0 0 0-.304-.102.493.493 0 0 0-.381.178l-6.287 7.962z" />
            </svg>
          )}
        </span>
      </div>
    </div>
  );
}
