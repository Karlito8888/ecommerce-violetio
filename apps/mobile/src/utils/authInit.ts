import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import { createSupabaseClient, initAnonymousSession } from "@ecommerce/shared";
import type { SupportedStorage } from "@ecommerce/shared";

// Re-export from shared package — single source of truth for anonymous session init.
export { initAnonymousSession };

/**
 * SecureStore-backed storage adapter for Supabase auth.
 * Encrypts session tokens on-device (Keychain on iOS, Keystore on Android).
 *
 * ## Web/Server fallback (no-op adapter)
 *
 * During `expo export --platform web` with `output: "static"`, Metro executes
 * `_layout.tsx` in Node.js for static pre-rendering. `expo-secure-store` is a
 * native module — its underlying `NativeModule.getValueWithKeyAsync` does not
 * exist in Node.js, causing a crash:
 *
 *   TypeError: n.default.getValueWithKeyAsync is not a function
 *
 * The crash happens because Supabase immediately calls `getItem()` during client
 * construction to recover the persisted session.
 *
 * Fix: when `Platform.OS === "web"` (which includes Node.js static rendering),
 * use a no-op storage adapter that returns null for all reads. This is safe
 * because the web export is only used for static HTML generation — no real auth
 * session exists in that context. On native (iOS/Android), the real SecureStore
 * adapter is used as before.
 */
const noopStorage: SupportedStorage = {
  getItem: () => Promise.resolve(null),
  setItem: () => Promise.resolve(),
  removeItem: () => Promise.resolve(),
};

const secureStoreAdapter: SupportedStorage = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

const storageAdapter = Platform.OS === "web" ? noopStorage : secureStoreAdapter;

/**
 * Initialize the Supabase client with SecureStore for encrypted session persistence.
 * Must be called once before any other Supabase usage (e.g. in _layout.tsx module scope).
 *
 * On web/server (static rendering), uses a no-op storage adapter to avoid
 * crashing on missing native modules. See JSDoc on `noopStorage` above.
 */
export function initSupabaseMobile() {
  createSupabaseClient({
    storage: storageAdapter,
    detectSessionInUrl: false,
  });
}
