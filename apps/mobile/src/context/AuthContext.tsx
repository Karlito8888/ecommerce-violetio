import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import * as SecureStore from "expo-secure-store";
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

const EDGE_FN_BASE = process.env.EXPO_PUBLIC_SUPABASE_URL
  ? `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/cart`
  : null;

const VIOLET_CART_KEY = "violet_cart_id";

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

  // Track whether previous auth state was anonymous (for cart merge detection)
  const wasAnonymousRef = useRef(false);
  const mergeInProgressRef = useRef(false);

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

      const isAnonymous = session?.user?.is_anonymous ?? false;

      setState({
        user: session?.user ?? null,
        session,
        isLoading: false,
        isAnonymous,
      });

      // ── Cart merge on anonymous → authenticated transition (Story 4.6) ──
      if (
        event === "SIGNED_IN" &&
        !isAnonymous &&
        wasAnonymousRef.current &&
        !mergeInProgressRef.current &&
        EDGE_FN_BASE &&
        session?.access_token
      ) {
        mergeInProgressRef.current = true;
        const token = session.access_token;
        const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

        try {
          const currentVioletCartId = await SecureStore.getItemAsync(VIOLET_CART_KEY);
          if (currentVioletCartId) {
            // Check if user has an existing authenticated cart
            const userCartRes = await fetch(`${EDGE_FN_BASE}/user`, {
              method: "GET",
              headers,
            });
            const { violetCartId: existingCartId } = await userCartRes.json();

            if (existingCartId && existingCartId !== currentVioletCartId) {
              // Merge anonymous items into existing cart
              const mergeRes = await fetch(`${EDGE_FN_BASE}/merge`, {
                method: "POST",
                headers,
                body: JSON.stringify({
                  anonymousVioletCartId: currentVioletCartId,
                  targetVioletCartId: existingCartId,
                }),
              });
              const mergeResult = await mergeRes.json();
              if (mergeResult.success) {
                await SecureStore.setItemAsync(VIOLET_CART_KEY, existingCartId);
              }
            } else if (!existingCartId) {
              // No existing cart → claim the anonymous cart
              await fetch(`${EDGE_FN_BASE}/claim`, {
                method: "POST",
                headers,
                body: JSON.stringify({ violetCartId: currentVioletCartId }),
              });
              // Keep same violet_cart_id in SecureStore
            }
          }
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn("[cart-sync] merge/claim failed:", err);
        } finally {
          mergeInProgressRef.current = false;
        }
      }

      wasAnonymousRef.current = isAnonymous;

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
