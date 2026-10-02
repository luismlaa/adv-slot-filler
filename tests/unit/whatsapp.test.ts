import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { silentLogger } from "@/adapters/logging/json-logger";
import { buildSendBody, createWhatsAppChannel } from "@/adapters/whatsapp/cloud-api";
import { parseWebhook, verifyChallenge, verifySignature } from "@/adapters/whatsapp/webhook";
import inboundText from "../fixtures/whatsapp/inbound-text.json";
import statusUpdate from "../fixtures/whatsapp/status-update.json";

describe("webhook de WhatsApp", () => {
  it("responde el challenge solo con el token correcto", () => {
    const params = new URLSearchParams({ "hub.mode": "subscribe", "hub.verify_token": "secreto", "hub.challenge": "1158201444" });
    expect(verifyChallenge(params, "secreto")).toBe("1158201444");
    expect(verifyChallenge(params, "otro")).toBeUndefined();
  });

  it("valida la firma HMAC del cuerpo crudo", () => {
    const body = JSON.stringify(inboundText);
    const signature = `sha256=${createHmac("sha256", "app-secret").update(body).digest("hex")}`;
    expect(verifySignature(body, signature, "app-secret")).toBe(true);
    expect(verifySignature(body, signature, "otro-secret")).toBe(false);
    expect(verifySignature(`${body} `, signature, "app-secret")).toBe(false);
    expect(verifySignature(body, null, "app-secret")).toBe(false);
  });

  it("extrae texto y respuestas de botón; ignora audio y estados", () => {
    const messages = parseWebhook(inboundText);
    expect(messages.map((m) => m.text)).toEqual(["Klk, quiero corte con Carlos el sábado", "Sí"]);
    expect(messages[0]).toMatchObject({ from: "+18095550101", profileName: "Pedro Martínez", providerMessageId: "wamid.HBgLMTgwOTU1NTAxMDEVAgASGBQzQUY3" });
    expect(parseWebhook(statusUpdate)).toEqual([]);
    expect(parseWebhook({ basura: true })).toEqual([]);
  });
});

describe("envío por WhatsApp Cloud API", () => {
  const config = { phoneNumberId: "106540352242922", accessToken: "token", apiVersion: "v23.0", maxRetries: 2 };

  it("usa texto libre para respuestas y plantilla para mensajes proactivos", () => {
    expect(buildSendBody({ to: "+18095550101", text: "hola", purpose: "reply" })).toMatchObject({ to: "18095550101", type: "text", text: { body: "hola" } });
    const template = buildSendBody({
      to: "+18095550101",
      text: "render local",
      purpose: "reactivation",
      template: { name: "cycle_reminder_v1", language: "es", params: ["Pedro", "4"] },
    });
    expect(template).toMatchObject({ type: "template", template: { name: "cycle_reminder_v1", language: { code: "es" } } });
  });

  it("reintenta 5xx y devuelve el wamid", async () => {
    const calls: number[] = [];
    const fakeFetch: typeof fetch = async () => {
      calls.push(1);
      return calls.length < 2
        ? new Response("boom", { status: 503 })
        : new Response(JSON.stringify({ messages: [{ id: "wamid.OK" }] }), { status: 200 });
    };
    const channel = createWhatsAppChannel(config, silentLogger, fakeFetch);
    await expect(channel.send({ to: "+18095550101", text: "hola", purpose: "reply" })).resolves.toEqual({ providerMessageId: "wamid.OK", delivered: true });
    expect(calls).toHaveLength(2);
  });

  it("no reintenta errores 4xx", async () => {
    let calls = 0;
    const fakeFetch: typeof fetch = async () => {
      calls += 1;
      return new Response('{"error":"invalid"}', { status: 400 });
    };
    const channel = createWhatsAppChannel(config, silentLogger, fakeFetch);
    await expect(channel.send({ to: "+18095550101", text: "hola", purpose: "reply" })).rejects.toThrow(/HTTP 400/);
    expect(calls).toBe(1);
  });

  it("dry-run no llama a la API", async () => {
    const fakeFetch: typeof fetch = async () => {
      throw new Error("no debería llamarse");
    };
    const channel = createWhatsAppChannel({ ...config, dryRun: true }, silentLogger, fakeFetch);
    expect((await channel.send({ to: "+18095550101", text: "hola", purpose: "reply" })).delivered).toBe(false);
  });
});
