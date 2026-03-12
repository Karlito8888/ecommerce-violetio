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
    let initialSessionHandled = false;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      // Only transition from loading after the initial session is resolved
      if (event === "INITIAL_SESSION") {
        initialSessionHandled = true;

        // If no session exists yet, kick off anonymous sign-in
        if (!session) {
          initAnonymousSession(supabase).catch((err) => {
            // eslint-disable-next-line no-console
            console.warn("[auth] initAnonymousSession error:", err);
            setState((prev) => ({ ...prev, isLoading: false }));
          });
          return; // Don't set isLoading=false yet — wait for SIGNED_IN event from initAnonymousSession
        }
      }

      // For INITIAL_SESSION with a session, or any subsequent event, update state
      if (initialSessionHandled || event !== "INITIAL_SESSION") {
        setState({
          user: session?.user ?? null,
          session,
          isLoading: false,
          isAnonymous: session?.user?.is_anonymous ?? false,
        });
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return state;
}
