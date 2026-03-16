/**
 * Order and webhook types.
 *
 * - Story 4.4: `OrderSubmitResult` — transient submit response with 3DS fields
 * - Story 4.5: `OrderDetail` — persisted order with bags, items, totals (for confirmation page)
 * - Story 5.1: Will add data persistence layer (Supabase) and email confirmation
 * - Story 3.7: Webhook types for Violet event processing
 *
 * ## Command vs Query separation
 * `OrderSubmitResult` = command response (POST /submit, includes `paymentIntentClientSecret` for 3DS)
 * `OrderDetail` = query response (GET /orders/{id}, includes items, addresses, dates)
 * These are intentionally separate — submit is transient, order detail is persisted.
 *
 * @see https://docs.violet.io/prism/checkout-guides/guides/order-and-bag-states
 */

// ─── Checkout / Submit (Story 4.4) ───────────────────────────────────────

/**
 * Violet order status — all 7 states from official docs.
 *
 * - `IN_PROGRESS`: cart is being processed (transient, pre-submission)
 * - `PROCESSING`: brief millisecond status while being submitted to merchant
 * - `ACCEPTED`: all bags accepted by merchants (post-submission, pre-completion)
 * - `COMPLETED`: order placed successfully — card charged
 * - `REQUIRES_ACTION`: 3D Secure challenge needed — call `stripe.handleNextAction()`
 *   with the `paymentIntentClientSecret`, then re-submit with the same `appOrderId`
 * - `REJECTED`: critical failure during submission (terminal)
 * - `CANCELED`: merchant chose to cancel after initially accepting (terminal)
 *
 * @see https://docs.violet.io/prism/checkout-guides/guides/order-and-bag-states
 * @see https://docs.violet.io/api-reference/checkout-cart/submit-cart
 */
export type OrderStatus =
  | "IN_PROGRESS"
  | "PROCESSING"
  | "ACCEPTED"
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
    /** Bag fulfillment status — uses BagStatus state machine, not OrderStatus */
    status: BagStatus;
    /** Bag financial/payment status — tracks payment capture and refund state */
    financialStatus: BagFinancialStatus;
    /** Bag total in integer cents */
    total: number;
  }>;
}

/**
 * Violet bag fulfillment status — all 9 states from official docs.
 *
 * ## State machine transitions
 * ```
 * IN_PROGRESS → SUBMITTED → ACCEPTED (standard path)
 * ACCEPTED → SHIPPED → COMPLETED (fulfillment path)
 * ACCEPTED → REFUNDED | PARTIALLY_REFUNDED (return scenarios)
 * ACCEPTED → CANCELED (merchant cancellation)
 * ACCEPTED → BACKORDERED (items backordered on merchant platform)
 * SUBMITTED | IN_PROGRESS → REJECTED (platform rejection after retries)
 * ```
 *
 * - `IN_PROGRESS`: initial state upon bag creation until submission
 * - `SUBMITTED`: brief transitional state when submitted to merchant's platform
 * - `ACCEPTED`: successfully received by the e-commerce platform
 * - `SHIPPED`: bag has been shipped by the merchant — sent in BAG_SHIPPED webhook
 *   payloads and persisted to the database. Not listed in Violet's official BagStatus
 *   enum documentation but appears in practice via webhook events.
 * - `COMPLETED`: all fulfillments shipped and confirmed delivered; bag is finished
 * - `REFUNDED`: all items returned and fully refunded (terminal)
 * - `PARTIALLY_REFUNDED`: some items returned; can transition to REFUNDED
 * - `CANCELED`: merchant cancellation — does NOT trigger automatic refund (terminal)
 * - `REJECTED`: e-commerce platform rejected the bag after retries (terminal)
 * - `BACKORDERED`: items are backordered on the merchant platform
 *
 * @see https://docs.violet.io/prism/checkout-guides/carts-and-bags/bags/states-of-a-bag
 */
export type BagStatus =
  | "IN_PROGRESS"
  | "SUBMITTED"
  | "ACCEPTED"
  | "SHIPPED"
  | "COMPLETED"
  | "REFUNDED"
  | "PARTIALLY_REFUNDED"
  | "CANCELED"
  | "REJECTED"
  | "BACKORDERED";

/**
 * Financial status of a merchant bag — tracks payment state independently from fulfillment.
 *
 * ## State machine transitions
 * ```
 * UNPAID → AUTHORIZED → PENDING → PAID (standard payment flow)
 * AUTHORIZED | PENDING → VOIDED (payment capture failure)
 * PAID → PARTIALLY_REFUNDED → REFUNDED (refund flow)
 * PAID → REFUNDED (full refund)
 * ```
 *
 * - `UNPAID`: payment not yet captured (pre-submission or initial state)
 * - `AUTHORIZED`: payment authorized but not yet captured
 * - `PENDING`: payment capture in progress
 * - `PAID`: payment successfully captured by merchant
 * - `PARTIALLY_PAID`: partial payment captured (rare, multi-payment scenarios)
 * - `PARTIALLY_REFUNDED`: some items returned and partially refunded
 * - `REFUNDED`: all items returned and fully refunded (terminal)
 * - `VOIDED`: payment authorization voided before capture (terminal)
 *
 * @see https://docs.violet.io/prism/checkout-guides/carts-and-bags/bags/states-of-a-bag
 */
export type BagFinancialStatus =
  | "UNPAID"
  | "AUTHORIZED"
  | "PENDING"
  | "PAID"
  | "PARTIALLY_PAID"
  | "PARTIALLY_REFUNDED"
  | "REFUNDED"
  | "VOIDED";

/**
 * A completed or in-progress order.
 *
 * Orders and bags have different state machines:
 * - `OrderStatus` tracks the overall order lifecycle (IN_PROGRESS → COMPLETED / REJECTED)
 * - `BagStatus` tracks per-merchant bag fulfillment (SUBMITTED → ACCEPTED → COMPLETED / REFUNDED)
 *
 * An order can be COMPLETED while individual bags are still in ACCEPTED state
 * (awaiting shipment), so these must remain separate union types.
 */
export interface Order {
  id: string;
  cartId: string;
  userId: string;
  status: OrderStatus;
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

// ─── Order Detail (Story 4.5 — Confirmation Page) ────────────────────

/**
 * A single line item (SKU) within a merchant bag.
 *
 * Mapped from Violet's `bags[].skus[]` — snake_case → camelCase at the adapter boundary.
 * Prices are integer cents (e.g., 4999 = $49.99).
 *
 * @see https://docs.violet.io/api-reference/orders-and-checkout/orders/get-order-by-id
 */
export interface OrderBagItem {
  skuId: string;
  name: string;
  quantity: number;
  /** Unit price in integer cents */
  price: number;
  /** Line price in integer cents (price × quantity) */
  linePrice: number;
  /** Product thumbnail URL from merchant catalog */
  thumbnail?: string;
}

/**
 * A merchant bag within a completed order.
 *
 * Violet's Cart/Bag model: one Cart → many Bags (one per merchant).
 * Each bag has independent lifecycle states (ACCEPTED, COMPLETED, REJECTED, etc.)
 * meaning mixed states are possible within a single order.
 *
 * @see https://docs.violet.io/prism/checkout-guides/carts-and-bags/bags/states-of-a-bag
 */
export interface OrderBag {
  id: string;
  merchantName: string;
  /** Bag-level fulfillment status — uses the BagStatus state machine */
  status: BagStatus;
  /** Financial/payment status — tracks payment capture and refund state */
  financialStatus: BagFinancialStatus;
  items: OrderBagItem[];
  /** Subtotal in integer cents (sum of all item line prices) */
  subtotal: number;
  /** Shipping cost in integer cents */
  shippingTotal: number;
  /** Tax amount in integer cents */
  taxTotal: number;
  /** Bag total in integer cents (subtotal + shipping + tax) */
  total: number;
  /** Shipping carrier and method label — absent if not yet shipped */
  shippingMethod?: { carrier: string; label: string };
}

/**
 * Complete order details returned by GET /orders/{id} — for the confirmation page.
 *
 * ## Why this exists alongside `Order`
 * The existing `Order` type (Story 5.1 placeholder) is a lightweight model for
 * order lists. `OrderDetail` is the full response including bags, items, addresses,
 * and customer info — everything needed for the "Post-Purchase Wow Moment" page.
 *
 * ## Violet order states lifecycle (from official docs)
 * IN_PROGRESS → PROCESSING → COMPLETED (happy path)
 * IN_PROGRESS → PROCESSING → REQUIRES_ACTION → PROCESSING → COMPLETED (3DS)
 * IN_PROGRESS → PROCESSING → REJECTED (payment failed)
 * COMPLETED → CANCELED (merchant cancellation)
 *
 * @see https://docs.violet.io/prism/checkout-guides/guides/order-and-bag-states
 * @see https://docs.violet.io/api-reference/orders-and-checkout/orders/get-order-by-id
 */
export interface OrderDetail {
  /** Violet order ID (numeric, stored as string per our convention) */
  id: string;
  status: OrderStatus;
  currency: string;
  /** Subtotal in integer cents */
  subtotal: number;
  /** Shipping total in integer cents */
  shippingTotal: number;
  /** Tax total in integer cents */
  taxTotal: number;
  /** Grand total in integer cents */
  total: number;
  /** Per-merchant bags with items, totals, and shipping info */
  bags: OrderBag[];
  /** Guest customer info provided during checkout */
  customer: { email: string; firstName: string; lastName: string };
  /** Shipping destination address */
  shippingAddress: {
    address1: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  /** ISO 8601 datetime when the order was submitted to merchants */
  dateSubmitted?: string;
}

// ─── Webhook Types (Story 3.7) ───────────────────────────────────────

/**
 * All webhook event types our system handles.
 *
 * Offer events: triggered by Violet when merchant product data changes (Story 3.7).
 * Sync events: triggered when a full catalog sync lifecycle changes (Story 3.7).
 * Order events: triggered by Violet when order status changes (Story 5.2).
 * Bag events: triggered by Violet when per-merchant bag status changes (Story 5.2).
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
  | "PRODUCT_SYNC_FAILED"
  | "ORDER_UPDATED"
  | "ORDER_COMPLETED"
  | "ORDER_CANCELED"
  | "ORDER_REFUNDED"
  | "ORDER_RETURNED"
  | "BAG_SUBMITTED"
  | "BAG_ACCEPTED"
  | "BAG_SHIPPED"
  | "BAG_COMPLETED"
  | "BAG_CANCELED"
  | "BAG_REFUNDED";

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

// ─── Order/Bag Webhook Types (Story 5.2) ──────────────────────────────

/**
 * Violet ORDER_* webhook payload — sent when an order's status changes.
 *
 * `status` is z.string() (not OrderStatus enum) because Violet may send
 * undocumented values — same defensive pattern as OfferWebhookPayload.status.
 *
 * @see https://docs.violet.io/prism/checkout-guides/guides/order-and-bag-states
 */
export interface OrderWebhookPayload {
  /** Violet order ID (numeric) */
  id: number;
  status: string;
  app_order_id?: string;
  customer_id?: number;
  date_last_modified?: string;
}

/**
 * Violet BAG_* webhook payload — sent when a per-merchant bag's status changes.
 *
 * `order_id` links back to the parent order for status derivation.
 * BAG_SHIPPED includes tracking_number, tracking_url, and carrier.
 *
 * @see https://docs.violet.io/prism/checkout-guides/carts-and-bags/bags/states-of-a-bag
 */
export interface BagWebhookPayload {
  /** Violet bag ID (numeric) */
  id: number;
  /** Violet order ID that owns this bag */
  order_id: number;
  status: string;
  financial_status?: string;
  merchant_id: number;
  merchant_name?: string;
  tracking_number?: string;
  tracking_url?: string;
  carrier?: string;
  date_last_modified?: string;
}
