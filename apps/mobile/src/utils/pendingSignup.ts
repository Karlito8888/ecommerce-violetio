// apps/mobile/src/utils/pendingSignup.ts
//
// SecureStore-based pending signup data (F2 correction).
//
// Previously stored email + password in plain module variables (let _email/_password).
// Now uses expo-secure-store for encrypted ephemeral storage — the password is never
// held in JavaScript heap memory between screens.
//
// Data lifecycle:
//   1. signup.tsx → setPendingSignup(email, password) → SecureStore write
//   2. verify.tsx → getPendingSignup() → SecureStore read
//   3. verify.tsx → clearPendingSignup() → SecureStore delete (after successful OTP)

import * as SecureStore from "expo-secure-store";

const PENDING_EMAIL_KEY = "pending_signup_email";
const PENDING_PASSWORD_KEY = "pending_signup_password";

/**
 * Store pending signup credentials in SecureStore (encrypted iOS Keychain / Android Keystore).
 * Called from signup.tsx after Convex Auth sends the verification OTP.
 */
export async function setPendingSignup(email: string, password: string): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(PENDING_EMAIL_KEY, email),
    SecureStore.setItemAsync(PENDING_PASSWORD_KEY, password),
  ]);
}

/**
 * Retrieve pending signup credentials from SecureStore.
 * Returns empty strings if no pending signup exists.
 */
export async function getPendingSignup(): Promise<{ email: string; password: string }> {
  const [email, password] = await Promise.all([
    SecureStore.getItemAsync(PENDING_EMAIL_KEY),
    SecureStore.getItemAsync(PENDING_PASSWORD_KEY),
  ]);
  return { email: email ?? "", password: password ?? "" };
}

/**
 * Clear pending signup credentials from SecureStore after successful verification.
 */
export async function clearPendingSignup(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(PENDING_EMAIL_KEY),
    SecureStore.deleteItemAsync(PENDING_PASSWORD_KEY),
  ]);
}
