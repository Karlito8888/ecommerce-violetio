import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseClient } from "./supabase.js";

/**
 * Ensures an anonymous Supabase session exists for the current user/device.
 * - If a session is already persisted (cookies/SecureStore), returns it.
 * - Otherwise calls signInAnonymously() to create a new anonymous user.
 *
 * @param client — Optional pre-configured Supabase client. Web passes the
 *   cookie-based browser client from @supabase/ssr; mobile omits this to
 *   use the shared singleton with SecureStore storage.
 */
export async function initAnonymousSession(client?: SupabaseClient) {
  const supabase = client ?? createSupabaseClient();

  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError) {
    console.warn("[auth] Failed to read existing session:", sessionError.message);
  }

  if (session) {
    return { session, isNew: false };
  }

  const { data, error } = await supabase.auth.signInAnonymously();

  if (error) {
    console.error("[auth] Failed to create anonymous session:", error.message);
    return { session: null, isNew: false };
  }

  return { session: data.session, isNew: true };
}
