// apps/mobile/src/utils/convexStorage.ts
//
// SecureStore-based token storage for Convex Auth on React Native.
// Required because React Native doesn't have localStorage.
//
// Doc: https://labs.convex.dev/auth/api_reference/react
// "In React Native we recommend wrapping expo-secure-store."

import * as SecureStore from "expo-secure-store";
import type { TokenStorage } from "@convex-dev/auth/react";

/**
 * Convex Auth token storage backed by Expo SecureStore.
 * Stores JWT and refresh tokens securely in the device keychain.
 */
export const convexTokenStorage: TokenStorage = {
  async getItem(key: string) {
    return await SecureStore.getItemAsync(key);
  },
  async setItem(key: string, value: string) {
    await SecureStore.setItemAsync(key, value);
  },
  async removeItem(key: string) {
    await SecureStore.deleteItemAsync(key);
  },
};
