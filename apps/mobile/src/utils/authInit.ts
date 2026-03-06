import * as SecureStore from "expo-secure-store";
import { createSupabaseClient, initAnonymousSession } from "@ecommerce/shared";
import type { SupportedStorage } from "@ecommerce/shared";

// Re-export from shared package — single source of truth for anonymous session init.
export { initAnonymousSession };

/**
 * SecureStore-backed storage adapter for Supabase auth.
 * Encrypts session tokens on-device (Keychain on iOS, Keystore on Android).
 */
const secureStoreAdapter: SupportedStorage = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

/**
 * Initialize the Supabase client with SecureStore for encrypted session persistence.
 * Must be called once before any other Supabase usage (e.g. in _layout.tsx module scope).
 */
export function initSupabaseMobile() {
  createSupabaseClient({
    storage: secureStoreAdapter,
    detectSessionInUrl: false,
  });
}
