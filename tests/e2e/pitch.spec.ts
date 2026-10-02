import { expect, test } from "@playwright/test";

/**
 * Recorre el guion de pitch completo sobre la build de producción, offline:
 * los mismos clics que hará el presentador en /demo.
 */
test.describe("demo de pitch", () => {
  test.beforeEach(async ({ request }) => {
    const reset = await request.post("/api/demo/reset");
    expect(reset.ok()).toBe(true);
  });

  test("las 5 escenas funcionan de principio a fin", async ({ page }) => {
    await page.goto("/demo");
    const phone = page.locator("[aria-live=polite]");
    const note = page.getByRole("status").filter({ hasText: /./ }).last();
    const step = async (label: string) => {
      await page.getByRole("button", { name: label, exact: true }).click();
      await expect(page.getByRole("button", { name: `✓ ${label}` })).toBeVisible({ timeout: 20_000 });
    };

    // 1. Pedro pide a Carlos el sábado: está lleno → alternativas → elige.
    await step("Pedro escribe");
    await expect(phone).toContainText("Carlos está lleno el sábado");
    await expect(page.getByRole("heading", { level: 1, name: /^sáb/i })).toBeVisible();
    await step("Pedro elige la 1");
    await expect(phone).toContainText("Listo ✅");

    // 2. Juan cancela → oferta a José → José acepta → hueco lleno.
    await step("Juan avisa");
    await expect(phone).toContainText("¿Confirmas que cancelamos");
    await step("Juan confirma");
    await expect(phone).toContainText("Se liberó un espacio con Carlos");
    await step("José acepta");
    await expect(phone).toContainText("Listo ✅");
    await expect(note).toContainText("se rellenó solo");

    // 3. Cuatro semanas después: invitación por ciclo → Pedro dice sí.
    await step("Avanzar 4 semanas");
    await expect(phone).toContainText("Ya van 4 semanas de tu último");
    await step("Pedro dice sí");
    await expect(page.getByText("🔁 Volvió por su ciclo").first()).toBeVisible();

    // 4. Evento personal en el Google Calendar de Carlos → bloqueo en la agenda.
    await step("Carlos agenda algo personal");
    await expect(page.getByText("Cita médica").first()).toBeVisible();

    // 5. ROI.
    await page.goto("/metricas");
    await expect(page.getByText("Ingresos recuperados en 30 días")).toBeVisible();
    await expect(page.getByText(/RD\$\d/).first()).toBeVisible();
  });

  test("el presentador puede escribir libremente como cliente", async ({ page }) => {
    await page.goto("/demo");
    await page.getByRole("tab", { name: "Ana" }).click();
    await page.getByLabel("Mensaje de Ana Gómez").fill("hola, qué tienen libre el sábado?");
    await page.getByRole("button", { name: "Enviar" }).click();
    await expect(page.locator("[aria-live=polite]")).toContainText(/Andrea|espacio|lleno/);
  });

  test("las pantallas del salón cargan", async ({ page }) => {
    for (const [path, text] of [
      ["/agenda", "espacios libres"],
      ["/por-volver", "Clientes por volver esta semana"],
      ["/lista-espera", "Lista de espera"],
      ["/metricas", "Lo que Slot Filler le devolvió al salón"],
      ["/ajustes", "Automatización"],
      ["/barbero", "Próximo cliente"],
    ] as const) {
      await page.goto(path);
      await expect(page.getByText(text).first()).toBeVisible({ timeout: 20_000 });
    }
  });
});
