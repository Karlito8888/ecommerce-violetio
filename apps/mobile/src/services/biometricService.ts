import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import { createSupabaseClient, setBiometricPreference } from "@ecommerce/shared";
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
 */
export async function enrollBiometric(
  userId: string,
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
    const { error } = await setBiometricPreference(userId, true);
    if (error) {
      await clearCredentials();
      return { success: false, error: "BIOMETRIC.STORAGE_ERROR" };
    }

    return { success: true };
  } finally {
    enrollmentInProgress = false;
  }
}

/** Disable biometric: clear credentials and update Supabase preference. */
export async function disableBiometric(userId: string): Promise<void> {
  await clearCredentials();
  await setBiometricPreference(userId, false);
}

/**
 * Attempt biometric login: retrieve stored credentials → restore Supabase session.
 * Implements 3-strike fallback counter (in-memory, resets on app restart).
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

  // Restore Supabase session from stored refresh token
  const supabase = createSupabaseClient();
  const { error } = await supabase.auth.setSession({
    access_token: "",
    refresh_token: creds.refreshToken,
  });

  if (error) {
    biometricFailCount++;
    if (biometricFailCount >= MAX_BIOMETRIC_ATTEMPTS) {
      biometricFailCount = 0;
      return { success: false, fallbackToPassword: true, error: "BIOMETRIC.SESSION_EXPIRED" };
    }
    return {
      success: false,
      attemptsRemaining: MAX_BIOMETRIC_ATTEMPTS - biometricFailCount,
      error: "BIOMETRIC.SESSION_EXPIRED",
    };
  }

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
