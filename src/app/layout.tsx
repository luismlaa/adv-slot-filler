import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Slot Filler",
  description: "Agenda inteligente para barberías y salones: reparte, rellena huecos y trae a cada cliente en su ciclo.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
