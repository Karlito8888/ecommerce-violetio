import { createClient, SupabaseClient } from "@supabase/supabase-js";

const LOCAL_SUPABASE_URL = "http://localhost:54321";

const _envOverrides: Record<string, string> = {};

/**
 * Register environment variables for platforms where process.env is unavailable (e.g. React Native).
 * Call this early in the app entry point before any Supabase client usage.
 */
export function configureEnv(vars: Record<string, string>): void {
  Object.assign(_envOverrides, vars);
}

function getEnvVar(name: string): string | undefined {
  if (_envOverrides[name]) return _envOverrides[name];
  if (typeof process !== "undefined" && process.env) {
    return process.env[name];
  }
  return undefined;
}

function requireEnvVar(name: string): string {
  const value = getEnvVar(name);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

let _supabaseClient: SupabaseClient | null = null;

export function createSupabaseClient(): SupabaseClient {
  if (_supabaseClient) return _supabaseClient;

  const url = getEnvVar("SUPABASE_URL") || LOCAL_SUPABASE_URL;
  const key = requireEnvVar("SUPABASE_ANON_KEY");

  _supabaseClient = createClient(url, key);
  return _supabaseClient;
}

/**
 * Server-only client that bypasses Row-Level Security.
 * Never import this in client-side (browser/mobile) code.
 */
export function getServiceRoleClient(): SupabaseClient {
  if (typeof window !== "undefined") {
    throw new Error(
      "getServiceRoleClient() must not be called in browser/client code. " +
        "The service role key bypasses RLS and must never be exposed to clients.",
    );
  }

  const url = getEnvVar("SUPABASE_URL") || LOCAL_SUPABASE_URL;
  const key = requireEnvVar("SUPABASE_SERVICE_ROLE_KEY");

  return createClient(url, key);
}
