import { useEffect, useState } from "react";
import type { AuthSession } from "@ecommerce/shared";
import { initAnonymousSession } from "@ecommerce/shared";
import { getSupabaseBrowserClient } from "../utils/supabase";

/**
 * React hook that provides the current Supabase auth session.
 * Automatically initializes an anonymous session if none exists.
 * Listens to auth state changes (sign-in, sign-out, token refresh).
 *
 * Uses the cookie-based browser client from @supabase/ssr so the
 * session is visible to the SSR server on subsequent requests.
 */
export function useAuthSession(): AuthSession {
  const [state, setState] = useState<AuthSession>({
    user: null,
    session: null,
    isLoading: true,
    isAnonymous: false,
  });

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();

    // Initialize anonymous session on first load, then subscribe to changes
    initAnonymousSession(supabase).catch((err) => {
      console.warn("[auth] initAnonymousSession error:", err);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setState({
        user: session?.user ?? null,
        session,
        isLoading: false,
        isAnonymous: session?.user?.is_anonymous ?? false,
      });
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return state;
}
