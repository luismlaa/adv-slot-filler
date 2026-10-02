import { notFound, redirect } from "next/navigation";
import { getContainer } from "@/lib/container";

export const dynamic = "force-dynamic";

/** La demo ES el producto: entra directo a la agenda del salón seed. El WhatsApp del cliente vive en `/chat`. */
export default function DemoPage() {
  const { env, demo } = getContainer();
  if (!env.DEMO_MODE || !demo) notFound();
  redirect("/agenda");
}
