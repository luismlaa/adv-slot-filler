import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { proxy } from "@/proxy";

const request = (path: string, cookie?: string) =>
  new NextRequest(new URL(path, "https://salon.example"), { headers: cookie ? { cookie } : {} });

describe("proxy de sesión", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("en la demo todo está abierto", () => {
    vi.stubEnv("DEMO_MODE", "true");
    vi.stubEnv("DATA_BACKEND", "memory");
    expect(proxy(request("/agenda")).headers.get("location")).toBeNull();
  });

  it("en producción, sin sesión, las pantallas del salón llevan al login", () => {
    vi.stubEnv("DEMO_MODE", "false");
    vi.stubEnv("DATA_BACKEND", "supabase");
    const location = proxy(request("/agenda")).headers.get("location");
    expect(location).toBe("https://salon.example/login?next=%2Fagenda");
  });

  it("en producción, con cookie de sesión, deja pasar", () => {
    vi.stubEnv("DEMO_MODE", "false");
    vi.stubEnv("DATA_BACKEND", "supabase");
    expect(proxy(request("/agenda", "sb-abc-auth-token=xyz")).headers.get("location")).toBeNull();
  });

  it("en producción la demo no existe", () => {
    vi.stubEnv("DEMO_MODE", "false");
    vi.stubEnv("DATA_BACKEND", "supabase");
    expect(proxy(request("/demo")).headers.get("location")).toBe("https://salon.example/agenda");
  });
});
