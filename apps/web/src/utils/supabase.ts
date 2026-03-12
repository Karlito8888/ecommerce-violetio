import { createBrowserClient } from "@supabase/ssr";

/**
 * Returns the Supabase browser client backed by cookie storage (@supabase/ssr).
 *
 * createBrowserClient is a singleton by default in browser environments —
 * repeated calls return the same instance. Cookies are read/written via
 * document.cookie automatically, making the session visible to the SSR server.
 */
export function getSupabaseBrowserClient() {
  const url = import.meta.env.VITE_SUPABASE_URL || "http://localhost:54321";
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!anonKey) {
    throw new Error(
      "Missing VITE_SUPABASE_ANON_KEY environment variable. " +
        "Set it in .env or .env.local for local development.",
    );
  }

  return createBrowserClient(url, anonKey);
}
