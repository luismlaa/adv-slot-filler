import { type SupabaseClient, createClient } from "@supabase/supabase-js";

/** Cliente con service role: solo servidor (route handlers, jobs, webhooks). */
export function createServiceClient(url: string, serviceRoleKey: string, timeoutMs = 10_000): SupabaseClient {
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(timeoutMs) }) },
  });
}
