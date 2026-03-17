/**
 * Supabase client functions for push notification tokens and preferences (Story 6.7).
 *
 * ## Design decisions
 *
 * 1. **Separate tables** — Push tokens and preferences live in dedicated tables
 *    (not embedded in user_profiles.preferences JSONB). This enables simple RLS
 *    and direct Edge Function queries without parsing nested JSON.
 *
 * 2. **Upsert pattern** — Token registration uses upsert on expo_push_token
 *    (a device can only have one token). Preference toggle uses upsert on
 *    (user_id, notification_type) unique constraint.
 *
 * 3. **Optional client parameter** — Matches wishlist.ts pattern. Default:
 *    browser client (RLS-protected). Edge Functions use service_role client.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseClient } from "./supabase.js";
import type {
  NotificationType,
  NotificationPreference,
  PushToken,
} from "../types/notification.types.js";

/**
 * Registers or updates an Expo push token for a user's device.
 * Uses upsert on expo_push_token — each physical token maps to exactly one row.
 */
export async function upsertPushToken(
  userId: string,
  token: string,
  deviceId: string,
  platform: "ios" | "android",
  client?: SupabaseClient,
): Promise<void> {
  const supabase = client ?? createSupabaseClient();
  const { error } = await supabase.from("user_push_tokens").upsert(
    {
      user_id: userId,
      expo_push_token: token,
      device_id: deviceId,
      platform,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "expo_push_token" },
  );
  if (error) throw error;
}

/**
 * Removes a push token (called when Expo Push API returns DeviceNotRegistered).
 */
export async function deletePushToken(token: string, client?: SupabaseClient): Promise<void> {
  const supabase = client ?? createSupabaseClient();
  const { error } = await supabase.from("user_push_tokens").delete().eq("expo_push_token", token);
  if (error) throw error;
}

/**
 * Fetches all active push tokens for a user (multi-device support).
 */
export async function getUserPushTokens(
  userId: string,
  client?: SupabaseClient,
): Promise<PushToken[]> {
  const supabase = client ?? createSupabaseClient();
  const { data, error } = await supabase.from("user_push_tokens").select("*").eq("user_id", userId);
  if (error) throw error;
  return (data ?? []) as PushToken[];
}

/**
 * Fetches all notification preferences for a user.
 * Returns raw DB rows — the hook layer merges with defaults.
 */
export async function getNotificationPreferences(
  userId: string,
  client?: SupabaseClient,
): Promise<NotificationPreference[]> {
  const supabase = client ?? createSupabaseClient();
  const { data, error } = await supabase
    .from("notification_preferences")
    .select("*")
    .eq("user_id", userId);
  if (error) throw error;
  return (data ?? []) as NotificationPreference[];
}

/**
 * Toggles a single notification preference type.
 * Uses upsert on (user_id, notification_type) unique constraint.
 */
export async function upsertNotificationPreference(
  userId: string,
  type: NotificationType,
  enabled: boolean,
  client?: SupabaseClient,
): Promise<void> {
  const supabase = client ?? createSupabaseClient();
  const { error } = await supabase.from("notification_preferences").upsert(
    {
      user_id: userId,
      notification_type: type,
      enabled,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,notification_type" },
  );
  if (error) throw error;
}
