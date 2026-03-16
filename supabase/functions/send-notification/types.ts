/**
 * Types for the send-notification Edge Function (Story 5.6).
 *
 * These types define the contract between webhook processors (callers) and the
 * notification function, as well as the Supabase query shapes used to build
 * email context.
 *
 * ## Notification lifecycle
 * 1. Webhook processor (handle-webhook) fires `supabase.functions.invoke("send-notification", { body })`
 * 2. send-notification validates the {@link NotificationPayload}
 * 3. Fetches {@link OrderContext} from Supabase (nested select: orders → order_bags → order_items + order_refunds)
 * 4. Renders HTML email via templates.ts using the context
 * 5. Sends via Resend API as {@link EmailPayload}
 * 6. Logs result to `notification_logs` table
 *
 * @see https://docs.violet.io/prism/webhooks/events/order-webhooks.md — Webhook events that trigger notifications
 * @see https://docs.resend.com/api-reference/emails/send-email — Resend email API
 */

/**
 * The four transactional email types supported by the notification pipeline.
 *
 * - `order_confirmed`: Triggered at checkout completion (not via webhook)
 * - `bag_shipped`: Triggered by BAG_SHIPPED webhook → processBagShipped
 * - `bag_delivered`: Triggered by BAG_COMPLETED webhook → processBagUpdated (status=COMPLETED)
 * - `refund_processed`: Triggered by BAG_REFUNDED webhook → processBagRefunded
 *
 * These map 1:1 to the CHECK constraint on `notification_logs.notification_type`.
 */
export type NotificationType =
  | "order_confirmed"
  | "bag_shipped"
  | "bag_delivered"
  | "refund_processed";

/**
 * Payload sent by webhook processors to invoke the send-notification function.
 *
 * - `order_confirmed` requires only `order_id` (all bags shown)
 * - All other types require both `order_id` and `bag_id` (Violet bag ID as string)
 *
 * Both `order_id` and `bag_id` are **Violet's external numeric IDs** (as strings),
 * NOT our internal UUIDs. Webhook processors pass `String(payload.order_id)` and
 * `String(payload.id)` from the Violet webhook payload.
 *
 * - `order_id` is matched against `orders.violet_order_id` (not `orders.id`)
 * - `bag_id` is matched against `order_bags.violet_bag_id` (not `order_bags.id`)
 */
export interface NotificationPayload {
  type: NotificationType;
  /** Violet's numeric order ID (matched against `orders.violet_order_id`) */
  order_id: string;
  /** Violet bag ID (required for bag_shipped, bag_delivered, refund_processed) */
  bag_id?: string;
}

/**
 * Order context fetched from Supabase for email template rendering.
 * Mirrors the nested select: `*, order_bags(*, order_items(*), order_refunds(*))`.
 *
 * Note: `email` is populated during checkout for both guest and authenticated buyers.
 * `user_id` determines tracking URL routing (authenticated → /account/orders/:id,
 * guest → /order/lookup with email verification).
 */
export interface OrderContext {
  id: string;
  violet_order_id: string;
  /** Buyer's email — always populated, used as notification recipient */
  email: string;
  status: string;
  /** Total in integer cents (e.g., 4999 = $49.99) */
  total: number;
  currency: string;
  /** SHA-256 hash of guest lookup token (raw token not stored — cannot reverse for email links) */
  order_lookup_token_hash: string | null;
  /** Null for guest orders; present for authenticated buyers */
  user_id: string | null;
  created_at: string;
  order_bags: BagContext[];
}

/**
 * Bag context within an order, including nested items and refunds.
 *
 * Maps to Violet's bag concept — each bag represents items from a single merchant.
 * A multi-merchant order has multiple bags, each with independent status lifecycle.
 *
 * @see https://docs.violet.io/prism/checkout-guides/guides/order-and-bag-states.md — Bag states
 */
export interface BagContext {
  id: string;
  /** Violet's numeric bag ID stored as TEXT */
  violet_bag_id: string;
  merchant_name: string;
  /** Violet bag status: IN_PROGRESS, SUBMITTED, ACCEPTED, SHIPPED, COMPLETED, CANCELED, REFUNDED */
  status: string;
  tracking_number: string | null;
  tracking_url: string | null;
  carrier: string | null;
  /** Bag total in integer cents */
  total: number;
  order_items: ItemContext[];
  /** Refund records from the Violet Refund API, stored in order_refunds table */
  order_refunds: RefundContext[];
}

/**
 * Individual line item within a bag.
 * Price is in integer cents per unit.
 */
export interface ItemContext {
  product_name: string;
  quantity: number;
  /** Unit price in integer cents */
  price: number;
  /** SKU variant name (e.g., "Size: M, Color: Blue") — null if single-variant product */
  sku_name: string | null;
}

/**
 * Refund record fetched from Violet's Refund API and stored in `order_refunds`.
 *
 * Violet webhooks (BAG_REFUNDED) do NOT include refund amounts — these are fetched
 * separately via `GET /v1/orders/{id}/bags/{id}/refunds` by processBagRefunded.
 *
 * Supports both full and partial refunds. A bag can have multiple refund records
 * (e.g., two partial refunds). The refund email template sums all refund amounts.
 *
 * @see https://docs.violet.io/api-reference/orders-and-checkout/order-refunds/refund-bag.md
 */
export interface RefundContext {
  /** Refund amount in integer cents */
  amount: number;
  /** Merchant-provided reason — may be null */
  reason: string | null;
  currency: string;
  /** Typically "PROCESSED" — Violet refund status */
  status: string;
}

/**
 * Payload sent to the Resend API (`POST https://api.resend.com/emails`).
 *
 * `from` defaults to `EMAIL_FROM_ADDRESS` env var or "noreply@example.com".
 * `to` is always `orders.email` (the buyer's email from checkout).
 * `html` is the rendered inline-CSS email template (no external stylesheets for email client compatibility).
 */
export interface EmailPayload {
  from: string;
  to: string;
  subject: string;
  html: string;
}
