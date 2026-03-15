/**
 * Order and webhook types.
 *
 * Order types are placeholders — full implementation in Story 5.1.
 * Webhook types (Story 3.7) define the contract for Violet webhook events
 * processed by the handle-webhook Edge Function.
 */

// ─── Checkout / Submit (Story 4.4) ───────────────────────────────────────

/**
 * Violet order status returned by POST /checkout/cart/{id}/submit.
 *
 * - `IN_PROGRESS`: cart is being processed (transient)
 * - `PROCESSING`: payment is being captured
 * - `COMPLETED`: order placed successfully — card charged
 * - `REQUIRES_ACTION`: 3D Secure challenge needed — call `stripe.handleNextAction()`
 *   with the `paymentIntentClientSecret`, then re-submit with the same `appOrderId`
 * - `REJECTED`: payment or order rejected by Violet/merchant
 * - `CANCELED`: order was canceled
 *
 * @see https://docs.violet.io/api-reference/checkout-cart/submit-cart
 * @see Story 4.4 AC#6
 */
export type OrderStatus =
  | "IN_PROGRESS"
  | "PROCESSING"
  | "COMPLETED"
  | "REQUIRES_ACTION"
  | "REJECTED"
  | "CANCELED";

/**
 * Input for submitting an order to Violet.
 *
 * `appOrderId` is a unique identifier generated client-side (via `crypto.randomUUID()`)
 * and reused across retries (after 3DS) for idempotency. Violet uses this to detect
 * duplicate submissions.
 *
 * @see Story 4.4 AC#13 — idempotency via appOrderId
 */
export interface OrderSubmitInput {
  appOrderId: string;
}

/**
 * Result of POST /checkout/cart/{id}/submit — the order submission outcome.
 *
 * ## Status handling
 * - `COMPLETED`: navigate to order confirmation page
 * - `REQUIRES_ACTION`: call `stripe.handleNextAction({ clientSecret: paymentIntentClientSecret })`
 *   then re-call `/submit` with the same `appOrderId`
 * - `REJECTED`: show error to user, re-enable submit button
 *
 * ## Why this is separate from `Order`
 * The submit response contains transient fields (`paymentIntentClientSecret` for 3DS)
 * that don't belong on a persisted Order entity. The full `Order` type (Story 5.1)
 * will model the post-checkout, persisted order.
 *
 * @see https://docs.violet.io/api-reference/checkout-cart/submit-cart
 * @see Story 4.4 C5 — submitOrder implementation reference
 */
export interface OrderSubmitResult {
  /** Violet order ID (numeric, as string per our ID convention) */
  id: string;
  status: OrderStatus;
  /**
   * Present only when `status === "REQUIRES_ACTION"` — pass to
   * `stripe.handleNextAction()` for 3D Secure challenge resolution.
   */
  paymentIntentClientSecret?: string;
  /** Per-merchant bag statuses after submission */
  bags: Array<{
    id: string;
    status: string;
    financialStatus: string;
    /** Bag total in integer cents */
    total: number;
  }>;
}

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
