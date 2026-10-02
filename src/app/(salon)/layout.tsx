import { SalonShell } from "@/components/shell/salon-shell";

export default function SalonLayout({ children }: LayoutProps<"/">) {
  return <SalonShell>{children}</SalonShell>;
}
