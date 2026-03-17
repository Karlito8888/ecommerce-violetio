/**
 * Types for the send-push Edge Function (Story 6.7).
 *
 * ## Notification lifecycle
 * 1. Webhook processor or cron job invokes `supabase.functions.invoke("send-push", { body })`
 * 2. send-push validates the {@link SendPushRequest}
 * 3. Maps PushNotificationType → NotificationType to check user preferences
 * 4. Fetches all push tokens for the target user
 * 5. Sends via Expo Push API
 * 6. Logs result to `notification_logs` table (with `push_` prefix)
 * 7. Cleans up invalid tokens (DeviceNotRegistered)
 */

// SYNC: Types below are duplicated from packages/shared/src/types/notification.types.ts
// because Edge Functions (Deno) cannot import from the shared package (Node/bundler).
// Keep both files in sync when adding/removing notification types.

/** Specific push event types that trigger a notification. */
export type PushNotificationType =
  | "order_confirmed"
  | "order_shipped"
  | "order_delivered"
  | "refund_processed"
  | "price_drop"
  | "back_in_stock";

/** User-facing preference categories. */
export type NotificationType = "order_updates" | "price_drops" | "back_in_stock" | "marketing";

/** Maps push event types to preference categories for opt-out checking. */
export const PUSH_TYPE_TO_PREFERENCE: Record<PushNotificationType, NotificationType> = {
  order_confirmed: "order_updates",
  order_shipped: "order_updates",
  order_delivered: "order_updates",
  refund_processed: "order_updates",
  price_drop: "price_drops",
  back_in_stock: "back_in_stock",
};

/** Engagement types subject to anti-spam daily limit. */
export const ENGAGEMENT_TYPES: PushNotificationType[] = ["price_drop", "back_in_stock"];

/** Request body for the send-push Edge Function. */
export interface SendPushRequest {
  user_id: string;
  type: PushNotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

/** Expo Push API message format. */
export interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound: "default";
  channelId: string;
}

/** Individual ticket from Expo Push API response. */
export interface ExpoPushTicket {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: { error?: string };
}
