// apps/mobile/src/context/AuthContext.tsx
//
// Auth context backed by Convex Auth + biometric (SecureStore).
//
// Phase 11 cleanup: removed Supabase-compat fields (user, session, isAnonymous)
// that had zero consumers.
//
// The context provides both Convex Auth state and biometric state,
// so existing consumers (BiometricPrompt, BiometricToggle, ProfileScreen)
// continue to work without changes.

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import * as SecureStore from "expo-secure-store";
import { useConvexAuth } from "@convex-dev/auth/react";
import { useQuery, useMutation } from "convex/react";
import { api } from "#convex/_generated/api";
import type { BiometricStatus, BiometricAuthResult } from "@ecommerce/shared";
import {
  checkBiometricAvailability,
  attemptBiometricLogin as attemptBiometricLoginService,
  enrollBiometric,
  disableBiometric as disableBiometricService,
  hasBiometricCredentials,
  resetBiometricFailCount,
} from "@/services/biometricService";
import { apiPost } from "@/server/apiClient";
import { CART_STORAGE_KEY } from "@/constants/cart";
import { getOrCreateLocalIdMobile, clearLocalIdMobile } from "@/utils/mobileLocalId";

/** Mobile auth session interface — consumed by screens and components. */
export interface MobileAuthSession {
  /** Convex user ID (subject), or null if not authenticated */
  userId: string | null;
  /** User email, or null */
  email: string | null;
  /** localId for anonymous visitors (SecureStore-backed) */
  localId: string;
  /** Whether Convex Auth session is active */
  isAuthenticated: boolean;
  /** Whether auth state is still resolving */
  isLoading: boolean;
}

interface BiometricAuthSession extends MobileAuthSession {
  biometricStatus: BiometricStatus | null;
  biometricEnabled: boolean;
  attemptBiometricLogin: () => Promise<BiometricAuthResult>;
  enableBiometric: () => Promise<{ success: boolean; error?: string }>;
  disableBiometric: () => Promise<void>;
}

const defaultBiometricSession: BiometricAuthSession = {
  userId: null,
  email: null,
  localId: "",
  isAuthenticated: false,
  isLoading: true,
  biometricStatus: null,
  biometricEnabled: false,
  attemptBiometricLogin: async () => ({ success: false }),
  enableBiometric: async () => ({ success: false }),
  disableBiometric: async () => {},
};

const AuthContext = createContext<BiometricAuthSession>(defaultBiometricSession);

/**
 * Provides auth state (Convex Auth + biometric) to the entire app.
 *
 * Auth state comes from useConvexAuth() + useQuery(api.users.queries.getIdentity).
 * Biometric state is managed separately via SecureStore.
 * Cart merge on anonymous→authenticated is handled here.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading: convexLoading } = useConvexAuth();
  const identity = useQuery(api.users.queries.getIdentity, isAuthenticated ? {} : "skip");
  const migrateAnonymous = useMutation(api.users.mutations.migrateAnonymousData);
  const setBiometricMutation = useMutation(api.users.mutations.setBiometricPreference);

  const [localId, setLocalId] = useState("");
  const [biometricStatus, setBiometricStatus] = useState<BiometricStatus | null>(null);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [isMigrating, setIsMigrating] = useState(false);

  // Track previous auth state for cart merge
  const wasAuthenticatedRef = useRef(false);

  // Initialize localId from SecureStore
  useEffect(() => {
    getOrCreateLocalIdMobile().then(setLocalId);
  }, []);

  // Check biometric capability on mount
  useEffect(() => {
    checkBiometricAvailability().then(setBiometricStatus);
    hasBiometricCredentials().then((hasCredentials) => {
      if (hasCredentials) setBiometricEnabled(true);
    });
  }, []);

  // When user authenticates, check biometric preference + migrate anonymous data
  useEffect(() => {
    if (!isAuthenticated || !identity || isMigrating) return;

    // identity.subject is used below via identity directly
    // No need for a local userId binding here

    // Check biometric preference from Convex
    // This query is reactive — if the preference changes (e.g. biometric toggle),
    // the component re-renders automatically.
    // Note: biometricEnabled is set here on first auth detection.
    // Subsequent changes are handled by the BiometricToggle component directly.
    hasBiometricCredentials().then((hasCredentials) => {
      if (hasCredentials) setBiometricEnabled(true);
    });

    // Migrate anonymous data (wishlist, events) from localId → userId
    if (!wasAuthenticatedRef.current && localId) {
      setIsMigrating(true);
      migrateAnonymous({ localId })
        .then(async () => {
          await clearLocalIdMobile();
          // Generate a new localId for future anonymous use if logged out
          const newLocalId = await getOrCreateLocalIdMobile();
          setLocalId(newLocalId);
        })
        .catch((err) => {
          // Migration failure is non-blocking
          // eslint-disable-next-line no-console
          console.warn("[auth] Anonymous data migration failed:", err);
        })
        .finally(() => setIsMigrating(false));
    }

    wasAuthenticatedRef.current = true;
  }, [isAuthenticated, identity, localId, migrateAnonymous, isMigrating]);

  // ── Cart merge on anonymous → authenticated transition ──
  const mergeInProgressRef = useRef(false);

  useEffect(() => {
    if (!isAuthenticated || !identity || mergeInProgressRef.current) return;
    if (wasAuthenticatedRef.current) return; // Already merged on first auth

    mergeInProgressRef.current = true;

    (async () => {
      try {
        const currentVioletCartId = await SecureStore.getItemAsync(CART_STORAGE_KEY);
        if (currentVioletCartId) {
          const userCart = await apiPost<{ violetCartId?: string | null }>("/api/cart/user", {
            userId: identity.subject,
          });
          const existingCartId = userCart.violetCartId;

          if (existingCartId && existingCartId !== currentVioletCartId) {
            const mergeResult = await apiPost<{ success?: boolean }>("/api/cart/merge", {
              anonymousVioletCartId: currentVioletCartId,
              targetVioletCartId: existingCartId,
            });
            if (mergeResult.success) {
              await SecureStore.setItemAsync(CART_STORAGE_KEY, existingCartId);
            }
          } else if (!existingCartId) {
            await apiPost("/api/cart/claim", {
              violetCartId: currentVioletCartId,
              userId: identity.subject,
            });
          }
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn("[cart-sync] merge/claim failed:", err);
      } finally {
        mergeInProgressRef.current = false;
      }
    })();
  }, [isAuthenticated, identity]);

  // Reset on sign-out
  useEffect(() => {
    if (!isAuthenticated && wasAuthenticatedRef.current) {
      resetBiometricFailCount();
      setBiometricEnabled(false);
      wasAuthenticatedRef.current = false;
    }
  }, [isAuthenticated]);

  const attemptBiometricLogin = useCallback(async (): Promise<BiometricAuthResult> => {
    return attemptBiometricLoginService();
  }, []);

  const enableBiometric = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    if (!isAuthenticated || !identity) {
      return { success: false, error: "BIOMETRIC.AUTH_FAILED" };
    }
    // Note: biometricService needs adaptation for Convex Auth tokens.
    // TODO: Phase 11 — adapt enrollBiometric for Convex refresh token storage.
    const result = await enrollBiometric(
      setBiometricMutation,
      identity.email ?? "",
      // Biometric service needs a refresh token — for Convex Auth,
      // we'll need to adapt this in Phase 11
      "",
    );
    if (result.success) {
      setBiometricEnabled(true);
    }
    return { success: result.success, error: result.error };
  }, [isAuthenticated, identity]);

  const disableBiometric = useCallback(async (): Promise<void> => {
    if (!identity) return;
    await disableBiometricService(setBiometricMutation);
    setBiometricEnabled(false);
  }, [identity, setBiometricMutation]);

  const contextValue: BiometricAuthSession = {
    userId: isAuthenticated && identity ? identity.subject : null,
    email: isAuthenticated && identity ? (identity.email ?? null) : null,
    localId,
    isAuthenticated,
    isLoading: convexLoading || isMigrating,
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
