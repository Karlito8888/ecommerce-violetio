// SYNC: Types below are duplicated in supabase/functions/send-push/types.ts
// because Edge Functions (Deno) cannot import from this package.
// Keep both files in sync when adding/removing notification types.

/** User-facing notification preference categories (stored in notification_preferences table). */
export type NotificationType = "order_updates" | "price_drops" | "back_in_stock" | "marketing";

/** Specific push event types that trigger a notification send. */
export type PushNotificationType =
  | "order_confirmed"
  | "order_shipped"
  | "order_delivered"
  | "refund_processed"
  | "price_drop"
  | "back_in_stock";

/** Row shape from user_push_tokens table. */
export interface PushToken {
  id: string;
  user_id: string;
  expo_push_token: string;
  device_id: string;
  platform: "ios" | "android";
  created_at: string;
  updated_at: string;
}

/** Row shape from notification_preferences table. */
export interface NotificationPreference {
  id: string;
  user_id: string;
  notification_type: NotificationType;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

/** Merged preferences map with defaults applied for all categories. */
export type NotificationPreferencesMap = Record<NotificationType, boolean>;

/** Default preferences: transactional ON, marketing OFF. */
export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferencesMap = {
  order_updates: true,
  price_drops: true,
  back_in_stock: true,
  marketing: false,
};

/**
 * Maps specific push event types to their user-facing preference category.
 * Used by the send-push Edge Function to check if the user has opted in.
 */
export const PUSH_TYPE_TO_PREFERENCE: Record<PushNotificationType, NotificationType> = {
  order_confirmed: "order_updates",
  order_shipped: "order_updates",
  order_delivered: "order_updates",
  refund_processed: "order_updates",
  price_drop: "price_drops",
  back_in_stock: "back_in_stock",
};

/** Payload for invoking the send-push Edge Function. */
export interface SendPushPayload {
  user_id: string;
  type: PushNotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}
