/**
 * Push notification registration and listener hooks (Story 6.7).
 *
 * MOBILE-ONLY — These hooks import expo-notifications and expo-device.
 * Do NOT import from web app code (apps/web).
 *
 * ## Registration flow
 * 1. Check if physical device (simulators can't receive push)
 * 2. Set up Android notification channel (required for Android 8+)
 * 3. Request permission (shows native OS dialog)
 * 4. Get Expo push token (requires EAS projectId)
 * 5. Upsert token to Supabase (multi-device support)
 */

import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { upsertPushToken } from "@ecommerce/shared";

// expo-notifications Android push support was removed from Expo Go in SDK 53.
// Detect Expo Go via Constants.appOwnership and skip all notification setup.
// In a dev build or production build, appOwnership is null/standalone.
const IS_EXPO_GO = Constants.appOwnership === "expo";

// Only import if we're NOT in Expo Go (dev build or production)

const Notifications: typeof import("expo-notifications") | null = IS_EXPO_GO
  ? null
  : (() => {
      try {
        return require("expo-notifications");
      } catch {
        return null;
      }
    })();

/**
 * Registers the device for push notifications and saves the token to Supabase.
 *
 * @param userId - Authenticated user ID. Registration is skipped if undefined.
 *
 * This hook:
 * - Requests notification permission on first call
 * - Creates an Android notification channel ("default")
 * - Gets the Expo push token using EAS projectId
 * - Upserts the token to user_push_tokens table
 * - Silently fails on error (token registration is not critical)
 */
export function usePushRegistration(userId: string | undefined) {
  const registeredForRef = useRef<string | null>(null);

  useEffect(() => {
    if (!userId || registeredForRef.current === userId) return;

    async function register() {
      try {
        const token = await registerForPushNotificationsAsync();
        if (!token) return;

        const deviceId = `${Device.modelName ?? "unknown"}-${Platform.OS}`;
        await upsertPushToken(userId!, token, deviceId, Platform.OS as "ios" | "android");
        registeredForRef.current = userId!;
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn("[usePushRegistration] Registration failed:", err);
      }
    }

    register();
  }, [userId]);
}

/**
 * Sets up notification listeners for foreground display and tap-to-open navigation.
 *
 * @param onNotificationResponse - Callback when user taps a notification.
 *   Receives the notification data payload for deep linking.
 */
export function useNotificationListeners(
  onNotificationResponse?: (data: Record<string, unknown>) => void,
) {
  const responseCallback = useRef(onNotificationResponse);
  responseCallback.current = onNotificationResponse;

  useEffect(() => {
    const N = Notifications;
    if (!N) return;

    let receivedSub: { remove: () => void } | null = null;
    let responseSub: { remove: () => void } | null = null;

    try {
      receivedSub = N.addNotificationReceivedListener((_notification) => {
        // Foreground notification received — display controlled by notification handler.
      });
      responseSub = N.addNotificationResponseReceivedListener((response) => {
        const data = response.notification.request.content.data;
        if (data && responseCallback.current) {
          responseCallback.current(data as Record<string, unknown>);
        }
      });
    } catch {
      // expo-notifications not supported in Expo Go SDK 53+ — silently skip
    }

    return () => {
      receivedSub?.remove();
      responseSub?.remove();
    };
  }, []);
}

/**
 * Configures the notification handler for foreground display.
 * Call this once at module level (outside component) in the root layout.
 */
export function setupNotificationHandler(): void {
  const N = Notifications;
  if (!N) return;
  try {
    N.setNotificationHandler({
      handleNotification: async () => ({
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
  } catch {
    // expo-notifications not supported in Expo Go SDK 53+ — silently skip
  }
}

/** Requests permission and returns the Expo push token, or undefined on failure. */
async function registerForPushNotificationsAsync(): Promise<string | undefined> {
  const N = Notifications;
  if (!N) return undefined;

  if (!Device.isDevice) {
    // eslint-disable-next-line no-console
    console.warn("[usePushRegistration] Push notifications require a physical device");
    return undefined;
  }

  // Android requires a notification channel (Android 8+)
  if (Platform.OS === "android") {
    await N.setNotificationChannelAsync("default", {
      name: "Default",
      importance: N.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  // Request permission
  const { status: existingStatus } = await N.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== "granted") {
    const { status } = await N.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== "granted") {
    return undefined;
  }

  // Get Expo push token (requires EAS projectId)
  const projectId = Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;
  if (!projectId) {
    // eslint-disable-next-line no-console
    console.warn("[usePushRegistration] EAS projectId not configured — cannot get push token");
    return undefined;
  }

  const tokenData = await N.getExpoPushTokenAsync({ projectId });
  return tokenData.data;
}
