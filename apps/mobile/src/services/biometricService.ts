// Biometric authentication service — migrated from Supabase to Convex (Phase 6).
//
// Key changes:
//   - setBiometricPreference: uses Convex mutation instead of Supabase upsert
//   - attemptBiometricLogin: stores Convex Auth refresh token instead of Supabase token
//     (NOTE: Convex Auth refresh token handling needs adaptation — see TODO below)
//   - getBiometricPreference: uses Convex query via AuthContext (exposed as biometricEnabled)
//
// The biometric flow stores a refresh token in SecureStore. On app restart,
// attemptBiometricLogin retrieves it and tries to restore the session.
// With Supabase, this was supabase.auth.setSession(). With Convex Auth,
// the session restoration mechanism is different — Convex Auth manages tokens
// internally. For now, we store the Convex Auth session token and let the
// ConvexAuthProvider handle restoration via convexStorage (already configured
// in _layout.tsx). The biometric service is kept as a convenience layer for
// enrollment/disabling, but the actual session restoration is handled by
// Convex Auth's built-in token storage.

import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import type {
  BiometricStatus,
  BiometricAuthResult,
  BiometricEnrollResult,
} from "@ecommerce/shared";

const BIOMETRIC_SESSION_KEY = "biometric_session_token";
const BIOMETRIC_USER_EMAIL_KEY = "biometric_user_email";
const BIOMETRIC_KEYCHAIN = "biometric-credentials";

const MAX_BIOMETRIC_ATTEMPTS = 3;
let biometricFailCount = 0;
let enrollmentInProgress = false;

/** Check if the device supports biometric auth and has enrolled biometrics. */
export async function checkBiometricAvailability(): Promise<BiometricStatus> {
  const [isAvailable, isEnrolled, types] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync(),
    LocalAuthentication.supportedAuthenticationTypesAsync(),
  ]);

  return {
    isAvailable,
    isEnrolled,
    // AuthenticationType values match our BiometricType enum (1=fingerprint, 2=face, 3=iris)
    supportedTypes: types as number[],
  };
}

/** Prompt the user for explicit biometric authentication (used during enrollment). */
export async function authenticateWithBiometric(
  promptMessage = "Verify your identity",
): Promise<BiometricAuthResult> {
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage,
    disableDeviceFallback: true,
    cancelLabel: "Use Password",
  });

  if (result.success) {
    return { success: true };
  }

  return {
    success: false,
    error: result.error === "user_cancel" ? "BIOMETRIC.USER_CANCEL" : "BIOMETRIC.AUTH_FAILED",
  };
}

/** Store session credentials protected by biometric (OS-level protection). */
export async function storeCredentials(email: string, sessionToken: string): Promise<void> {
  await SecureStore.setItemAsync(BIOMETRIC_SESSION_KEY, sessionToken, {
    requireAuthentication: true,
    authenticationPrompt: "Authenticate to enable biometric login",
    keychainService: BIOMETRIC_KEYCHAIN,
  });
  // Email stored without biometric protection (for display purposes only)
  await SecureStore.setItemAsync(BIOMETRIC_USER_EMAIL_KEY, email, {
    keychainService: BIOMETRIC_KEYCHAIN,
  });
}

/**
 * Retrieve biometric-protected credentials.
 * This triggers the OS biometric prompt automatically via SecureStore.
 */
export async function retrieveCredentials(): Promise<{
  success: boolean;
  refreshToken?: string;
  email?: string;
  error?: string;
}> {
  try {
    const refreshToken = await SecureStore.getItemAsync(BIOMETRIC_SESSION_KEY, {
      requireAuthentication: true,
      authenticationPrompt: "Log in with biometric",
      keychainService: BIOMETRIC_KEYCHAIN,
    });
    const email = await SecureStore.getItemAsync(BIOMETRIC_USER_EMAIL_KEY, {
      keychainService: BIOMETRIC_KEYCHAIN,
    });

    if (!refreshToken) {
      return { success: false, error: "BIOMETRIC.CREDENTIAL_ERROR" };
    }

    return { success: true, refreshToken, email: email ?? undefined };
  } catch {
    return { success: false, error: "BIOMETRIC.STORAGE_ERROR" };
  }
}

/** Remove all biometric-protected credentials from SecureStore. */
export async function clearCredentials(): Promise<void> {
  await SecureStore.deleteItemAsync(BIOMETRIC_SESSION_KEY, {
    keychainService: BIOMETRIC_KEYCHAIN,
  });
  await SecureStore.deleteItemAsync(BIOMETRIC_USER_EMAIL_KEY, {
    keychainService: BIOMETRIC_KEYCHAIN,
  });
}

/**
 * Full enrollment flow: check availability → authenticate → store credentials → update preference.
 * Guards against double-tap with enrollmentInProgress flag.
 *
 * @param setBiometricFn - Convex mutation reference (api.users.mutations.setBiometricPreference)
 */
export async function enrollBiometric(
  setBiometricFn: (args: { enabled: boolean }) => Promise<unknown>,
  email: string,
  sessionToken: string,
): Promise<BiometricEnrollResult> {
  if (enrollmentInProgress) {
    return { success: false, error: "BIOMETRIC.AUTH_FAILED" };
  }

  enrollmentInProgress = true;
  try {
    const status = await checkBiometricAvailability();
    if (!status.isAvailable) {
      return { success: false, error: "BIOMETRIC.NOT_AVAILABLE" };
    }
    if (!status.isEnrolled) {
      return { success: false, error: "BIOMETRIC.NOT_ENROLLED" };
    }

    const authResult = await authenticateWithBiometric("Verify to enable biometric login");
    if (!authResult.success) {
      return { success: false, error: authResult.error ?? "BIOMETRIC.AUTH_FAILED" };
    }

    await storeCredentials(email, sessionToken);
    try {
      await setBiometricFn({ enabled: true });
    } catch {
      await clearCredentials();
      return { success: false, error: "BIOMETRIC.STORAGE_ERROR" };
    }

    return { success: true };
  } finally {
    enrollmentInProgress = false;
  }
}

/** Disable biometric: clear credentials and update Convex preference. */
export async function disableBiometric(
  setBiometricFn: (args: { enabled: boolean }) => Promise<unknown>,
): Promise<void> {
  await clearCredentials();
  await setBiometricFn({ enabled: false });
}

/**
 * Attempt biometric login: retrieve stored credentials.
 *
 * NOTE: With Convex Auth, session restoration is handled by the ConvexAuthProvider
 * via convexStorage (SecureStore-backed). The biometric service only needs to
 * confirm that credentials exist and prompt for biometric auth. The actual
 * session restoration happens automatically when the ConvexAuthProvider reads
 * the stored token from convexStorage.
 *
 * Returns success=true if biometric auth succeeds and stored credentials exist.
 * The caller (AuthContext) can then signal that the user is authenticated.
 */
export async function attemptBiometricLogin(): Promise<BiometricAuthResult> {
  const creds = await retrieveCredentials();

  if (!creds.success || !creds.refreshToken) {
    biometricFailCount++;
    if (biometricFailCount >= MAX_BIOMETRIC_ATTEMPTS) {
      biometricFailCount = 0;
      return { success: false, fallbackToPassword: true };
    }
    return {
      success: false,
      attemptsRemaining: MAX_BIOMETRIC_ATTEMPTS - biometricFailCount,
      error: (creds.error as BiometricAuthResult["error"]) ?? "BIOMETRIC.AUTH_FAILED",
    };
  }

  // With Convex Auth, the session is restored by ConvexAuthProvider reading from
  // convexStorage. Biometric login confirms the user's identity, then the
  // existing Convex Auth session is used. If the Convex session is expired,
  // the user will need to re-authenticate with password.
  biometricFailCount = 0;
  return { success: true };
}

/** Reset the fail counter (used in tests or when user successfully logs in via password). */
export function resetBiometricFailCount(): void {
  biometricFailCount = 0;
}

/**
 * Check if biometric credentials exist locally (non-protected key).
 * Used to determine if biometric prompt should be shown before auth state is known.
 */
export async function hasBiometricCredentials(): Promise<boolean> {
  try {
    const email = await SecureStore.getItemAsync(BIOMETRIC_USER_EMAIL_KEY, {
      keychainService: BIOMETRIC_KEYCHAIN,
    });
    return email !== null;
  } catch {
    return false;
  }
}
