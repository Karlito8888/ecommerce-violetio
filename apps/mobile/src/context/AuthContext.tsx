import React, { createContext, useContext, useEffect, useState } from "react";
import { createSupabaseClient } from "@ecommerce/shared";
import type { AuthSession } from "@ecommerce/shared";
import { initAnonymousSession } from "../utils/authInit";

const AuthContext = createContext<AuthSession>({
  user: null,
  session: null,
  isLoading: true,
  isAnonymous: false,
});

/** Provides auth state to the entire app. Wrap your root layout with this. */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthSession>({
    user: null,
    session: null,
    isLoading: true,
    isAnonymous: false,
  });

  useEffect(() => {
    const supabase = createSupabaseClient();

    // Subscribe to auth state changes first, then initialize anonymous session
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

    initAnonymousSession().catch((err) => {
      console.warn("[auth] initAnonymousSession error:", err);
      setState((prev) => ({ ...prev, isLoading: false }));
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

/** Access the current auth session anywhere in the app. */
export function useAuth(): AuthSession {
  return useContext(AuthContext);
}
