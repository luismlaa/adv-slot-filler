import { z } from "zod";

const flag = z
  .enum(["true", "false", "1", "0"])
  .default("false")
  .transform((v) => v === "true" || v === "1");

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v === undefined || v.trim() === "" ? undefined : v));

export const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    APP_URL: z.url().default("http://localhost:3000"),
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),

    DEMO_MODE: flag,
    DATA_BACKEND: z.enum(["memory", "supabase"]).default("memory"),

    NEXT_PUBLIC_SUPABASE_URL: optionalString,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: optionalString,
    SUPABASE_SERVICE_ROLE_KEY: optionalString,
    SALON_ID: optionalString,

    LLM_PROVIDER: z.enum(["rules", "claude"]).default("rules"),
    ANTHROPIC_API_KEY: optionalString,
    CLAUDE_MODEL: z.string().default("claude-haiku-4-5"),
    LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(8000),

    MESSAGING_CHANNEL: z.enum(["simulator", "whatsapp"]).default("simulator"),
    MESSAGING_DRY_RUN: flag,
    WHATSAPP_API_VERSION: z.string().default("v23.0"),
    WHATSAPP_PHONE_NUMBER_ID: optionalString,
    WHATSAPP_ACCESS_TOKEN: optionalString,
    WHATSAPP_APP_SECRET: optionalString,
    WHATSAPP_VERIFY_TOKEN: optionalString,

    CALENDAR_PROVIDER: z.enum(["fake", "google"]).default("fake"),
    GOOGLE_CLIENT_ID: optionalString,
    GOOGLE_CLIENT_SECRET: optionalString,
    GOOGLE_REDIRECT_URI: optionalString,
    GOOGLE_WEBHOOK_URL: optionalString,

    CRON_SECRET: optionalString,
  })
  .superRefine((env, ctx) => {
    const requireWhen = (cond: boolean, keys: (keyof typeof env)[], why: string) => {
      if (!cond) return;
      for (const key of keys) {
        if (env[key] === undefined) {
          ctx.addIssue({ code: "custom", path: [key], message: `${key} es requerido cuando ${why}` });
        }
      }
    };
    requireWhen(
      env.DATA_BACKEND === "supabase",
      ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SALON_ID"],
      "DATA_BACKEND=supabase",
    );
    requireWhen(env.LLM_PROVIDER === "claude", ["ANTHROPIC_API_KEY"], "LLM_PROVIDER=claude");
    requireWhen(
      env.MESSAGING_CHANNEL === "whatsapp",
      ["WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_ACCESS_TOKEN", "WHATSAPP_APP_SECRET", "WHATSAPP_VERIFY_TOKEN"],
      "MESSAGING_CHANNEL=whatsapp",
    );
    requireWhen(
      env.CALENDAR_PROVIDER === "google",
      ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REDIRECT_URI"],
      "CALENDAR_PROVIDER=google",
    );
    requireWhen(env.NODE_ENV === "production" && !env.DEMO_MODE, ["CRON_SECRET"], "se corre en producción");
  });

export type Env = z.infer<typeof envSchema>;

export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const details = result.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Configuración de entorno inválida:\n${details}`);
  }
  return result.data;
}

let cached: Env | undefined;

export function getEnv(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}
