import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { getCookie, setCookie } from "@tanstack/react-start/server";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-side Supabase client using the service role key.
 *
 * Used in TanStack Start Server Functions for cart persistence operations.
 * The service role key bypasses RLS — only use server-side, never expose to clients.
 *
 * Pattern mirrors `supabase/functions/_shared/supabaseAdmin.ts` for Edge Functions.
 */
let _client: SupabaseClient | null = null;

export function getSupabaseServer(): SupabaseClient {
  if (_client) return _client;

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables");
  }

  _client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  return _client;
}

/**
 * Session-aware Supabase server client for user-facing queries.
 *
 * Unlike `getSupabaseServer()` (service role — bypasses RLS), this client:
 * - Uses the anon key + user's session JWT from cookies
 * - Respects Row Level Security policies
 * - Must be called within a TanStack Start server function handler
 *   (requires request context for `getCookie`/`setCookie`)
 *
 * Use this for any query where data access should be scoped to the
 * authenticated user (orders, profiles, wishlists, etc.).
 *
 * ## Cookie reading
 * `@supabase/ssr` stores the session in chunked cookies:
 * `sb-{hostname}-auth-token`, `sb-{hostname}-auth-token.1`, etc.
 * We read up to 5 chunks — sufficient for any Supabase JWT.
 */
export function getSupabaseSessionClient(): SupabaseClient {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY environment variables");
  }

  // @supabase/ssr derives the cookie name prefix from the first segment of
  // the hostname: "127.0.0.1" → "127", "abcdefgh.supabase.co" → "abcdefgh".
  // The server must use the same derivation so it reads the correct cookie.
  const host = new URL(supabaseUrl).hostname.split(".")[0];

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        const chunks: { name: string; value: string }[] = [];
        // @supabase/ssr stores session in "sb-{host}-auth-token" (chunk 0)
        // and "sb-{host}-auth-token.N" for subsequent chunks
        for (let i = 0; i < 5; i++) {
          const name = `sb-${host}-auth-token${i === 0 ? "" : `.${i}`}`;
          const value = getCookie(name);
          if (value) chunks.push({ name, value });
        }
        return chunks;
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          setCookie(name, value, options as Parameters<typeof setCookie>[2]);
        });
      },
    },
  }) as unknown as SupabaseClient;
}
