import { type Page, expect, test } from "@playwright/test";

/**
 * Recorre el pitch completo sobre la build de producción, offline, igual que el presentador:
 * escribe como cliente en `/chat` (WhatsApp) y muestra el salón en las pantallas reales.
 */
test.describe("demo de pitch", () => {
  test.beforeEach(async ({ request }) => {
    const reset = await request.post("/api/demo/reset");
    expect(reset.ok()).toBe(true);
  });

  const openChat = async (page: Page, name: string) => {
    await page.goto("/chat");
    await page.getByRole("link", { name: new RegExp(name) }).click();
    await expect(page.getByText(`chateas como ${name}`)).toBeVisible();
    return page.getByRole("main", { name: `Chat de ${name}` });
  };
  const say = async (page: Page, text: string) => {
    await page.getByLabel("Escribe un mensaje").fill(text);
    await page.getByRole("button", { name: "Enviar" }).click();
  };

  test("el pitch completo, escribiendo por WhatsApp", async ({ page }) => {
    // 1. Pedro pide a Carlos el sábado: está lleno → alternativas → elige con un toque.
    let chat = await openChat(page, "Pedro Martínez");
    await say(page, "Klk, quiero un corte con Carlos el sábado");
    await expect(chat).toContainText("Carlos está lleno el sábado", { timeout: 20_000 });
    await page.getByRole("button", { name: "la 1" }).click();
    await expect(chat).toContainText("Listo ✅");

    // 2. Juan cancela → la oferta le llega sola a José → José acepta.
    chat = await openChat(page, "Juan Pérez");
    await say(page, "Mano, no voy a poder ir el sábado 😔");
    await expect(chat).toContainText("¿Confirmas que cancelamos");
    await page.getByRole("button", { name: "Sí, dale" }).click();
    await expect(chat).toContainText("cancelé tu cita");
    chat = await openChat(page, "José Ramírez");
    await expect(chat).toContainText("Se liberó un espacio con Carlos");
    await say(page, "Sí!! Dame ese");
    await expect(chat).toContainText("Listo ✅");

    // 3. El salón lo ve en la agenda, sin botones de demo a la vista.
    await page.goto("/agenda");
    await expect(page.getByText("espacios libres").first()).toBeVisible();
    await expect(page.getByText(/Pedro escribe|Juan avisa|Demo en vivo/)).toHaveCount(0);

    // 4. Presentador (tecla «.»): saltar al día en que a Pedro le toca volver.
    await page.keyboard.press(".");
    const panel = page.getByRole("complementary", { name: "Presentador" });
    await panel.getByLabel("Hasta que le toque volver a").selectOption({ label: "Pedro Martínez" });
    await panel.getByRole("button", { name: "Ir" }).last().click();
    chat = await openChat(page, "Pedro Martínez");
    await expect(chat).toContainText("Ya van 4 semanas de tu último", { timeout: 20_000 });
    await page.getByRole("button", { name: "Sí, dale" }).click();
    await expect(chat).toContainText("Listo ✅");
    // La cita que propuso la invitación aparece en la agenda marcada como regreso por ciclo.
    await page.goto("/agenda");
    const returning = page.getByText("🔁 Volvió por su ciclo").first();
    for (let day = 0; day < 7 && !(await returning.isVisible().catch(() => false)); day += 1) {
      await page.getByRole("button", { name: "Día siguiente" }).click();
      await page.waitForTimeout(400);
    }
    await expect(returning).toBeVisible();

    // 5. ROI.
    await page.goto("/metricas");
    await expect(page.getByText("Ingresos recuperados en 30 días")).toBeVisible();
    await expect(page.getByText(/RD\$\d/).first()).toBeVisible();
  });

  test("el agente responde lo del día a día", async ({ page }) => {
    const chat = await openChat(page, "Ana Gómez");
    await page.getByRole("button", { name: "¿Cuánto cuesta el fade?" }).click();
    await expect(chat).toContainText("RD$700");
    await say(page, "¿dónde queda?");
    await expect(chat).toContainText("Piantini");
    await say(page, "hola, qué tienen libre el sábado?");
    await expect(chat).toContainText(/Andrea|espacio|lleno/);
  });

  test("las pantallas del salón cargan", async ({ page }) => {
    for (const [path, text] of [
      ["/agenda", "espacios libres"],
      ["/por-volver", "Clientes por volver esta semana"],
      ["/lista-espera", "Lista de espera"],
      ["/metricas", "Lo que Slot Filler le devolvió al salón"],
      ["/ajustes", "Automatización"],
      ["/barbero", "Próximo cliente"],
      ["/chat", "Elige un cliente"],
    ] as const) {
      await page.goto(path);
      await expect(page.getByText(text).first()).toBeVisible({ timeout: 20_000 });
    }
  });
});
