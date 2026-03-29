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

// Vite 7+ forbids dynamic access to import.meta.env — each variable must be
// referenced by its full static key. We use a lazy getter so the static
// references exist in the source (satisfying Vite's static analysis) but the
// code is only evaluated in Vite environments where import.meta.env is defined.
function _getViteEnv(name: string): string | undefined {
  // Metro (React Native) doesn't define import.meta.env — bail early.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (typeof import.meta === "undefined" || !(import.meta as any).env) {
    return undefined;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const env = (import.meta as any).env;
  switch (name) {
    case "SUPABASE_URL":
      return env.SUPABASE_URL ?? env.VITE_SUPABASE_URL;
    case "SUPABASE_ANON_KEY":
      return env.SUPABASE_ANON_KEY ?? env.VITE_SUPABASE_ANON_KEY;
    case "VIOLET_API_KEY":
      return env.VIOLET_API_KEY ?? env.VITE_VIOLET_API_KEY;
    case "VIOLET_API_SECRET":
      return env.VIOLET_API_SECRET ?? env.VITE_VIOLET_API_SECRET;
    case "VIOLET_APP_ID":
      return env.VIOLET_APP_ID ?? env.VITE_VIOLET_APP_ID;
    case "OPENAI_API_KEY":
      return env.OPENAI_API_KEY ?? env.VITE_OPENAI_API_KEY;
    case "STRIPE_PUBLISHABLE_KEY":
      return env.STRIPE_PUBLISHABLE_KEY ?? env.VITE_STRIPE_PUBLISHABLE_KEY;
    default:
      return undefined;
  }
}

export function getEnvVar(name: string): string | undefined {
  if (_envOverrides[name] !== undefined) return _envOverrides[name];
  const viteVal = _getViteEnv(name);
  if (viteVal) return viteVal;
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

/**
 * Inject an externally-created Supabase client as the shared singleton.
 *
 * On the web app, `@supabase/ssr`'s `createBrowserClient()` stores the
 * session in cookies (visible to the SSR server), whereas the default
 * `createSupabaseClient()` uses localStorage. Call this function early
 * in the web app's lifecycle so that all shared hooks and client functions
 * (wishlist, profile, tracking, etc.) use the cookie-based client.
 *
 * Mobile apps do NOT need this — localStorage is the correct storage there.
 */
export function _setSupabaseClient(client: SupabaseClient): void {
  _supabaseClient = client;
}
