import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { createSupabaseClient, getBiometricPreference } from "@ecommerce/shared";
import type { AuthSession, BiometricStatus, BiometricAuthResult } from "@ecommerce/shared";
import { initAnonymousSession } from "../utils/authInit";
import {
  checkBiometricAvailability,
  attemptBiometricLogin as attemptBiometricLoginService,
  enrollBiometric,
  disableBiometric as disableBiometricService,
  hasBiometricCredentials,
  resetBiometricFailCount,
} from "../services/biometricService";

/** Extended auth context with biometric state and actions. */
interface BiometricAuthSession extends AuthSession {
  biometricStatus: BiometricStatus | null;
  biometricEnabled: boolean;
  attemptBiometricLogin: () => Promise<BiometricAuthResult>;
  enableBiometric: () => Promise<{ success: boolean; error?: string }>;
  disableBiometric: () => Promise<void>;
}

const defaultBiometricSession: BiometricAuthSession = {
  user: null,
  session: null,
  isLoading: true,
  isAnonymous: false,
  biometricStatus: null,
  biometricEnabled: false,
  attemptBiometricLogin: async () => ({ success: false }),
  enableBiometric: async () => ({ success: false }),
  disableBiometric: async () => {},
};

const AuthContext = createContext<BiometricAuthSession>(defaultBiometricSession);

/** Provides auth state (including biometric) to the entire app. */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthSession>({
    user: null,
    session: null,
    isLoading: true,
    isAnonymous: false,
  });
  const [biometricStatus, setBiometricStatus] = useState<BiometricStatus | null>(null);
  const [biometricEnabled, setBiometricEnabled] = useState(false);

  useEffect(() => {
    const supabase = createSupabaseClient();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      // Reset biometric fail counter on sign-out
      if (event === "SIGNED_OUT") {
        resetBiometricFailCount();
        setBiometricEnabled(false);
      }

      // On INITIAL_SESSION with no session, kick off anonymous sign-in and wait
      if (event === "INITIAL_SESSION" && !session) {
        initAnonymousSession().catch((err) => {
          // eslint-disable-next-line no-console
          console.warn("[auth] initAnonymousSession error:", err);
          setState((prev) => ({ ...prev, isLoading: false }));
        });
        return; // Wait for SIGNED_IN from initAnonymousSession
      }

      setState({
        user: session?.user ?? null,
        session,
        isLoading: false,
        isAnonymous: session?.user?.is_anonymous ?? false,
      });

      // Check biometric preference when a registered user is detected
      const user = session?.user;
      if (user && !user.is_anonymous) {
        const status = await checkBiometricAvailability();
        setBiometricStatus(status);
        const enabled = await getBiometricPreference(user.id);
        setBiometricEnabled(enabled);
      } else if (event !== "SIGNED_OUT") {
        setBiometricEnabled(false);
      }
    });

    // Check device biometric capability and local credentials on mount
    checkBiometricAvailability().then(setBiometricStatus);
    hasBiometricCredentials().then((hasCredentials) => {
      if (hasCredentials) setBiometricEnabled(true);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const attemptBiometricLogin = useCallback(async (): Promise<BiometricAuthResult> => {
    return attemptBiometricLoginService();
  }, []);

  const enableBiometric = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    const user = state.user;
    const session = state.session;
    if (!user || !session?.refresh_token) {
      return { success: false, error: "BIOMETRIC.AUTH_FAILED" };
    }
    const result = await enrollBiometric(user.id, user.email ?? "", session.refresh_token);
    if (result.success) {
      setBiometricEnabled(true);
    }
    return { success: result.success, error: result.error };
  }, [state.user, state.session]);

  const disableBiometric = useCallback(async (): Promise<void> => {
    const user = state.user;
    if (!user) return;
    await disableBiometricService(user.id);
    setBiometricEnabled(false);
  }, [state.user]);

  const contextValue: BiometricAuthSession = {
    ...state,
    biometricStatus,
    biometricEnabled,
    attemptBiometricLogin,
    enableBiometric,
    disableBiometric,
  };

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
}

/** Access the current auth session (with biometric state) anywhere in the app. */
export function useAuth(): BiometricAuthSession {
  return useContext(AuthContext);
}
