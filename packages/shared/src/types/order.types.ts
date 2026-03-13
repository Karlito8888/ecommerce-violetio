/**
 * Order and webhook types.
 *
 * Order types are placeholders — full implementation in Story 5.1.
 * Webhook types (Story 3.7) define the contract for Violet webhook events
 * processed by the handle-webhook Edge Function.
 */

/** Violet bag fulfillment status. */
export type BagStatus =
  | "PENDING"
  | "AWAITING_PAYMENT"
  | "IN_PROGRESS"
  | "SHIPPED"
  | "COMPLETED"
  | "CANCELLED"
  | "REFUNDED";

/** A completed or in-progress order. */
export interface Order {
  id: string;
  cartId: string;
  userId: string;
  status: BagStatus;
  /** Total in integer cents */
  total: number;
  currency: string;
  createdAt: string;
  updatedAt: string;
}

/** A Stripe payment intent for checkout. */
export interface PaymentIntent {
  id: string;
  clientSecret: string;
  /** Amount in integer cents */
  amount: number;
  currency: string;
}

// ─── Webhook Types (Story 3.7) ───────────────────────────────────────

/**
 * All webhook event types our system currently handles.
 *
 * Offer events: triggered by Violet when merchant product data changes.
 * Sync events: triggered when a full catalog sync lifecycle changes.
 *
 * **Story 5.2 will add ORDER_* event types.** Do NOT add them prematurely —
 * the handle-webhook Edge Function's switch statement must have a matching case
 * for every type in this union. Unhandled types waste webhook_events rows and
 * pollute monitoring.
 *
 * @see https://docs.violet.io/prism/webhooks — Violet webhook event reference
 * @see packages/shared/src/schemas/webhook.schema.ts — Zod enum (must stay in sync)
 */
export type WebhookEventType =
  | "OFFER_ADDED"
  | "OFFER_UPDATED"
  | "OFFER_REMOVED"
  | "OFFER_DELETED"
  | "PRODUCT_SYNC_STARTED"
  | "PRODUCT_SYNC_COMPLETED"
  | "PRODUCT_SYNC_FAILED";

/**
 * Normalized webhook event used internally by our system.
 *
 * The Edge Function extracts headers + body from Violet's raw webhook
 * and normalizes them into this shape before routing to processors.
 *
 * `entityId` is always a string — Violet sends numeric IDs but we convert
 * at the boundary to match our internal product_id convention.
 */
export interface WebhookEvent {
  id: string;
  type: WebhookEventType;
  entityId: string;
  data: unknown;
  createdAt: string;
}

/**
 * Violet offer webhook payload — the complete Offer object sent by Violet.
 *
 * Only fields relevant to our system are typed here. The full Violet Offer
 * object contains many more fields (variants, SKUs, albums) which are stored
 * in `webhook_events.payload` as raw JSONB for debugging.
 *
 * Prices are in integer cents (e.g., 2999 = $29.99).
 *
 * @see https://docs.violet.io/api-reference/catalog/offers — Full Offer schema
 */
export interface OfferWebhookPayload {
  id: number;
  name: string;
  description?: string;
  source: string;
  seller?: string;
  vendor?: string;
  merchant_id: number;
  available: boolean;
  visible: boolean;
  min_price?: number;
  max_price?: number;
  currency?: string;
  status: string;
  tags?: string[];
  external_url?: string;
  skus?: unknown[];
  albums?: unknown[];
  date_last_modified?: string;
}

/**
 * Violet sync webhook payload — sent when a full catalog sync lifecycle changes.
 *
 * These events are for monitoring only — no product-level action is taken.
 * The handle-webhook Edge Function logs them to webhook_events for dashboard visibility.
 */
export interface SyncWebhookPayload {
  id: number;
  merchant_id: number;
  status: "NOT_STARTED" | "PENDING" | "IN_PROGRESS" | "COMPLETED" | "FAILED" | "ABORTED";
  total_products: number;
  total_products_synced?: number;
}
