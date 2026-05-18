// apps/mobile/src/utils/mobileLocalId.ts
//
// Mobile-specific localId implementation using SecureStore.
// On web, localId uses localStorage. On mobile, we use expo-secure-store
// for encrypted persistence.
//
// Mirrors packages/shared/src/utils/localId.ts but adapted for React Native.

import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const LOCAL_ID_KEY = "maison_emile_local_id";

/**
 * Returns a persistent local ID for anonymous visitors (stored in SecureStore).
 * Creates one if it doesn't exist yet.
 *
 * Uses crypto.randomUUID() — available in Hermes (React Native 0.76+)
 * and standard Web Crypto API. Matches the web implementation in
 * packages/shared/src/utils/localId.ts.
 *
 * On web (static export), returns a session-scoped ID (no SecureStore available).
 */
export async function getOrCreateLocalIdMobile(): Promise<string> {
  if (Platform.OS === "web") {
    // Web fallback — shouldn't normally be called on mobile
    return `web-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  let id = await SecureStore.getItemAsync(LOCAL_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    await SecureStore.setItemAsync(LOCAL_ID_KEY, id);
  }
  return id;
}

/** Returns the existing localId without creating one. null if not set. */
export async function getLocalIdMobile(): Promise<string | null> {
  if (Platform.OS === "web") return null;
  return await SecureStore.getItemAsync(LOCAL_ID_KEY);
}

/** Deletes the localId after migration to Convex Auth userId. */
export async function clearLocalIdMobile(): Promise<void> {
  if (Platform.OS === "web") return;
  await SecureStore.deleteItemAsync(LOCAL_ID_KEY);
}
