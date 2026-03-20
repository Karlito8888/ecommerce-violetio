import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { SupportedStorage } from "@supabase/supabase-js";

export type { SupportedStorage };

export const LOCAL_SUPABASE_URL = "http://localhost:54321";

const _envOverrides: Record<string, string> = {};

/**
 * Register environment variables for platforms where process.env is unavailable (e.g. React Native).
 * Call this early in the app entry point before any Supabase client usage.
 */
export function configureEnv(vars: Record<string, string>): void {
  Object.assign(_envOverrides, vars);
}

export function getEnvVar(name: string): string | undefined {
  if (_envOverrides[name] !== undefined) return _envOverrides[name];
  // In Vite-based apps, import.meta.env contains env vars (VITE_-prefixed on client).
  // Cast to `any` because import.meta.env is a Vite extension not in base TS types,
  // and this shared package is consumed by both Vite (web) and Metro (mobile).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const meta = typeof import.meta !== "undefined" ? (import.meta as any) : null;
  if (meta?.env) {
    const env = meta.env as Record<string, string | undefined>;
    const metaVal = env[name] || env[`VITE_${name}`];
    if (metaVal) return metaVal;
  }
  if (typeof process !== "undefined" && process.env) {
    return process.env[name];
  }
  return undefined;
}

export function requireEnvVar(name: string): string {
  const value = getEnvVar(name);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export interface SupabaseBrowserConfig {
  /** Custom storage adapter — use SecureStore on mobile, defaults to localStorage on web. */
  storage?: SupportedStorage;
  /** Whether to detect session tokens from URL (set false on mobile). Defaults to true. */
  detectSessionInUrl?: boolean;
}

let _supabaseClient: SupabaseClient | null = null;

/**
 * Returns the shared Supabase browser client (singleton).
 * Pass `config` on first call to customize auth storage or URL detection.
 * On mobile: call this once at startup with a SecureStore adapter.
 */
export function createSupabaseClient(config?: SupabaseBrowserConfig): SupabaseClient {
  if (_supabaseClient) return _supabaseClient;

  const url = getEnvVar("SUPABASE_URL") || LOCAL_SUPABASE_URL;
  const key = requireEnvVar("SUPABASE_ANON_KEY");

  _supabaseClient = createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: config?.detectSessionInUrl ?? true,
      ...(config?.storage ? { storage: config.storage } : {}),
    },
  });

  return _supabaseClient;
}

/** Reset the singleton — use only in tests. */
export function _resetSupabaseClient(): void {
  _supabaseClient = null;
}
