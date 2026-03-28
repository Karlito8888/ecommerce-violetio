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
    // eslint-disable-next-line no-console
    console.warn("[auth] Failed to read existing session:", sessionError.message);
  }

  if (session) {
    return { session, isNew: false };
  }

  const { data, error } = await supabase.auth.signInAnonymously();

  if (error) {
    // eslint-disable-next-line no-console
    console.error("[auth] Failed to create anonymous session:", error.message);
    return { session: null, isNew: false };
  }

  return { session: data.session, isNew: true };
}

/**
 * Converts an anonymous session to a full account by linking email + password.
 * The auth.uid() is preserved so all RLS-linked data (cart, etc.) remains accessible.
 *
 * IMPORTANT: Do NOT use supabase.auth.signUp() — that creates a new user
 * with a different UUID, losing all anonymous session data.
 *
 * When email confirmations are disabled (local dev default), the account is
 * immediately usable. When enabled, an OTP is sent and verifyEmailOtp() must
 * be called before the user can sign in on other devices.
 */
export async function signUpWithEmail(email: string, password: string, client?: SupabaseClient) {
  const supabase = client ?? createSupabaseClient();
  const { data, error } = await supabase.auth.updateUser({ email, password });
  return { data, error };
}

/**
 * Step 2 of anonymous → full account conversion.
 * Verifies the 6-digit OTP sent to the user's email after signUpWithEmail().
 * Uses type 'email_change' because the anonymous user is adding an email.
 */
export async function verifyEmailOtp(email: string, token: string, client?: SupabaseClient) {
  const supabase = client ?? createSupabaseClient();
  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: "email_change",
  });
  return { data, error };
}

/**
 * Step 3 of anonymous → full account conversion.
 * Sets the password on the now-verified account. Must be called AFTER the
 * email is verified via verifyEmailOtp().
 */
export async function setAccountPassword(password: string, client?: SupabaseClient) {
  const supabase = client ?? createSupabaseClient();
  const { data, error } = await supabase.auth.updateUser({ password });
  return { data, error };
}

/**
 * Signs in a returning user with email and password.
 */
export async function signInWithEmail(email: string, password: string, client?: SupabaseClient) {
  const supabase = client ?? createSupabaseClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  return { data, error };
}

// ─── Social Login (Story 6.1) ──────────────────────────────────────────────

export type SocialProvider = "google" | "apple";

/**
 * Initiates OAuth sign-in with a social provider (web).
 * Supabase redirects the browser to the provider's consent screen.
 * After consent, the browser is redirected back to `redirectTo` where the
 * Supabase JS client auto-detects the token from the URL hash.
 */
export async function signInWithSocialProvider(
  provider: SocialProvider,
  options?: { redirectTo?: string },
  client?: SupabaseClient,
) {
  const supabase = client ?? createSupabaseClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: options?.redirectTo,
      queryParams: provider === "google" ? { prompt: "select_account" } : undefined,
    },
  });
  return { data, error };
}

/**
 * Initiates OAuth sign-in for mobile (Expo).
 * Returns the OAuth URL to open in expo-web-browser instead of redirecting.
 */
export async function signInWithSocialProviderMobile(
  provider: SocialProvider,
  client?: SupabaseClient,
) {
  const supabase = client ?? createSupabaseClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      skipBrowserRedirect: true,
      queryParams: provider === "google" ? { prompt: "select_account" } : undefined,
    },
  });
  return { data, error };
}

/**
 * Signs out the current user, clearing the session from storage.
 */
export async function signOut(client?: SupabaseClient) {
  const supabase = client ?? createSupabaseClient();
  const { error } = await supabase.auth.signOut();
  return { error };
}
