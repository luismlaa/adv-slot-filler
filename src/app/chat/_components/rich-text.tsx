/** Formato de WhatsApp: *negrita*. Nunca se inyecta HTML. */
export function RichText({ text }: { text: string }) {
  const parts = text.split(/(\*[^*\n]+\*)/g);
  return (
    <>
      {parts.map((p, i) => (p.length > 2 && p.startsWith("*") && p.endsWith("*") ? <strong key={i}>{p.slice(1, -1)}</strong> : <span key={i}>{p}</span>))}
    </>
  );
}

/** Texto sin marcas ni saltos, para la vista previa de la lista de chats. */
export const plainText = (text: string) => text.replace(/\*([^*\n]+)\*/g, "$1").replace(/\s+/g, " ");
