/**
 * Merchant detail from Violet API (GET /merchants/{id}).
 *
 * Enriched version of {@link MerchantRow} with data directly from Violet's
 * merchant endpoint. Used for the public-facing merchant page.
 *
 * @see https://docs.violet.io/api-reference/merchants/get-merchant-by-id
 */
export interface MerchantDetail {
  /** Violet merchant ID */
  id: string;
  /** Merchant display name */
  name: string;
  /** E-commerce platform (SHOPIFY, BIGCOMMERCE, etc.) */
  platform: string | null;
  /** Connection status */
  status: string;
  /** Commission rate as decimal (e.g., 0.12 = 12%) */
  commissionRate: number | null;
  /** Currency code (e.g., "USD") */
  currency: string | null;
  /** Store URL (e.g., "acme.myshopify.com") */
  storeUrl: string | null;
  /** ISO 8601 timestamp of initial connection */
  connectedAt: string | null;
}

/**
 * Supabase row type for the `merchants` table — central source of truth for connected merchants.
 *
 * Populated by MERCHANT_CONNECTED webhook and updated by MERCHANT_DISCONNECTED/ENABLED/DISABLED.
 * Replaces scattered merchant data across error_logs, webhook_events, and order_bags.
 *
 * @see https://docs.violet.io/prism/violet-connect/guides/detecting-merchants-post-connection
 */
export interface MerchantRow {
  /** Violet merchant ID (TEXT — string cast from Violet's numeric ID) */
  merchant_id: string;
  /** Merchant display name from Violet */
  name: string;
  /** E-commerce platform (SHOPIFY, BIGCOMMERCE, etc.) */
  platform: string | null;
  /** Connection status: CONNECTED | DISCONNECTED | ENABLED | DISABLED */
  status: string;
  /** Commission rate as decimal (e.g., 0.12 = 12%). Nullable — may not be in webhook payload. */
  commission_rate: number | null;
  /** ISO 8601 timestamp of initial connection */
  connected_at: string;
  /** ISO 8601 timestamp of last status update */
  updated_at: string;
}

/**
 * Supabase row type for the `orders` table — our local mirror of Violet's order data.
 *
 * This is distinct from Violet's `OrderDetail` (API response) — it represents the
 * persisted row in our Supabase database after {@link persistOrder} processes the
 * Violet response.
 *
 * ## Relationship to Violet
 * - `violet_order_id` links back to Violet's numeric order ID (stored as TEXT)
 * - `status` stores the derived order status (see {@link deriveOrderStatusFromBags})
 *   which may include synthetic states like "PARTIALLY_SHIPPED" not present in Violet
 * - `user_id` is our Supabase Auth UUID, NOT Violet's customer_id
 * - `session_id` is used for guest checkout session correlation
 *
 * ## Guest vs Authenticated orders
 * - Authenticated: `user_id` is set, `order_lookup_token_hash` is null
 * - Guest: `user_id` is null, `order_lookup_token_hash` stores SHA-256 of the
 *   one-time lookup token shown on the confirmation page
 *
 * ## Monetary values
 * All monetary fields (`subtotal`, `shipping_total`, `tax_total`, `total`) are
 * integer cents (e.g., 4999 = $49.99), matching Violet's convention.
 *
 * @see {@link OrderDetail} — the Violet API response type this is persisted from
 * @see {@link persistOrder} — the function that creates these rows
 * @see https://docs.violet.io/prism/checkout-guides/guides/order-and-bag-states
 */
export interface OrderRow {
  /** Supabase-generated UUID primary key */
  id: string;
  /** Violet's numeric order ID (stored as TEXT for consistency) */
  violet_order_id: string;
  /** Supabase Auth user UUID — null for guest checkouts */
  user_id: string | null;
  /** Anonymous session ID for guest checkout correlation */
  session_id: string | null;
  /** Customer email — always present (required for both guest and auth) */
  email: string;
  /** Derived order status — may include synthetic states like "PARTIALLY_SHIPPED" */
  status: string;
  /** Subtotal in integer cents */
  subtotal: number;
  /** Shipping cost in integer cents */
  shipping_total: number;
  /** Tax amount in integer cents */
  tax_total: number;
  /** Grand total in integer cents (subtotal + shipping + tax) */
  total: number;
  /** ISO 4217 currency code (e.g., "USD") */
  currency: string;
  /** SHA-256 hash of the guest lookup token — null for authenticated users */
  order_lookup_token_hash: string | null;
  /** Whether the order confirmation email has been sent */
  email_sent: boolean;
  /** ISO 8601 timestamp of row creation */
  created_at: string;
  /** ISO 8601 timestamp of last update (e.g., status change via webhook) */
  updated_at: string;
}

/**
 * Supabase row type for the `order_bags` table — one row per merchant bag.
 *
 * Maps to Violet's Bag concept: each Order contains one Bag per merchant.
 * Bags have independent lifecycle states from the parent Order, meaning
 * mixed states are normal (e.g., one bag SHIPPED while another is ACCEPTED).
 *
 * ## Status fields
 * - `status`: Bag fulfillment status from Violet (IN_PROGRESS, SUBMITTED, ACCEPTED,
 *   COMPLETED, REFUNDED, PARTIALLY_REFUNDED, CANCELED, REJECTED, BACKORDERED).
 *   Updated via BAG_* webhook events.
 * - `financial_status`: Bag payment status from Violet (UNPAID, AUTHORIZED, PENDING,
 *   PAID, PARTIALLY_PAID, REFUNDED, PARTIALLY_REFUNDED, VOIDED).
 *
 * ## Tracking fields
 * `tracking_number`, `tracking_url`, and `carrier` are populated when a BAG_SHIPPED
 * webhook arrives — Violet includes these in the BagWebhookPayload.
 *
 * @see {@link BagStatus} — the typed union for bag fulfillment states
 * @see {@link BagFinancialStatus} — the typed union for bag financial states
 * @see https://docs.violet.io/prism/checkout-guides/carts-and-bags/bags/states-of-a-bag
 */
export interface OrderBagRow {
  /** Supabase-generated UUID primary key */
  id: string;
  /** FK to orders.id (Supabase UUID) */
  order_id: string;
  /** Violet's numeric bag ID (stored as TEXT) */
  violet_bag_id: string;
  /** FK to merchants.merchant_id — populated at order creation from Violet bag data */
  merchant_id: string | null;
  /** Merchant display name from Violet */
  merchant_name: string;
  /** Bag fulfillment status — updated via BAG_* webhooks */
  status: string;
  /** Bag financial/payment status — updated via BAG_* webhooks */
  financial_status: string;
  /**
   * Bag fulfillment/delivery status — tracks shipping progress independently.
   * PROCESSING → SHIPPED → DELIVERED (standard flow).
   * Updated via BAG_* webhooks.
   */
  fulfillment_status: string;
  /** Subtotal in integer cents */
  subtotal: number;
  /** Shipping cost in integer cents */
  shipping_total: number;
  /** Tax amount in integer cents */
  tax_total: number;
  /** Bag total in integer cents */
  total: number;
  /** Commission rate (%) snapshotted from Violet at order time */
  commission_rate: number;
  /** Shipping method label (e.g., "Standard Shipping") — null if not yet shipped */
  shipping_method: string | null;
  /** Carrier tracking number — populated on BAG_SHIPPED webhook */
  tracking_number: string | null;
  /** Carrier tracking URL — populated on BAG_SHIPPED webhook */
  tracking_url: string | null;
  /** Shipping carrier name (e.g., "UPS", "FedEx") — populated on BAG_SHIPPED */
  carrier: string | null;
  /** ISO 8601 timestamp of row creation */
  created_at: string;
  /** ISO 8601 timestamp of last update */
  updated_at: string;
}

/**
 * Supabase row type for the `order_items` table — one row per SKU line item.
 *
 * Maps to Violet's `bags[].skus[]` — each item represents a specific product
 * variant (SKU) within a merchant bag. Prices are snapshotted at order time
 * and do not change if the merchant updates product pricing later.
 *
 * @see {@link OrderBagItem} — the camelCase equivalent used in API responses
 */
export interface OrderItemRow {
  /** Supabase-generated UUID primary key */
  id: string;
  /** FK to order_bags.id (Supabase UUID) */
  order_bag_id: string;
  /** Violet SKU ID (stored as TEXT) */
  sku_id: string;
  /** Product/variant display name snapshotted at order time */
  name: string;
  /** Quantity ordered */
  quantity: number;
  /** Unit price in integer cents (snapshotted at order time) */
  price: number;
  /** Line total in integer cents (price x quantity) */
  line_price: number;
  /** Product thumbnail URL — null if merchant didn't provide one */
  thumbnail: string | null;
  /** ISO 8601 timestamp of row creation */
  created_at: string;
}

/**
 * Supabase row type for order_refunds table.
 *
 * Populated by `processBagRefunded` after fetching from Violet's Refund API:
 *   `GET /v1/orders/{order_id}/bags/{bag_id}/refunds`
 *
 * Violet webhooks (BAG_REFUNDED) are thin notifications — they do NOT include
 * refund amount or reason. These must be fetched from the Refund API.
 *
 * Fields map to Violet's refund object:
 * - `violet_refund_id` ← Violet `id` (numeric, stored as TEXT for consistency)
 * - `amount` ← Violet `amount` (integer cents, e.g. 4999 = $49.99)
 * - `reason` ← Violet `refund_reason` (nullable — merchants may omit)
 * - `currency` ← Violet `refund_currency` (defaults to USD)
 * - `status` ← Violet `status` (e.g. "PROCESSED")
 *
 * @see https://docs.violet.io/api-reference/orders-and-checkout/order-refunds/refund-bag.md
 */
export interface OrderRefundRow {
  id: string;
  order_bag_id: string;
  violet_refund_id: string;
  amount: number; // integer cents
  reason: string | null;
  currency: string;
  status: string;
  created_at: string;
}

/**
 * Input for persisting an order into Supabase from Violet's OrderDetail response.
 *
 * This is the camelCase adapter layer between Violet's API response and our
 * snake_case Supabase schema. The mapping happens in the server function that
 * calls {@link persistOrder}.
 *
 * ## Guest vs Authenticated
 * - `userId` is null for guest checkouts — triggers guest token generation
 * - `sessionId` is set for guest checkouts for session correlation
 *
 * @see {@link persistOrder} — consumes this input
 * @see {@link OrderDetail} — the Violet API response this is mapped from
 */
export interface PersistOrderInput {
  /** Violet's numeric order ID (as string) */
  violetOrderId: string;
  /** Supabase Auth user UUID — null for guest checkouts */
  userId: string | null;
  /** Anonymous session ID — used for guest checkout correlation */
  sessionId: string | null;
  /** Customer email address */
  email: string;
  /** Violet order status at time of persistence (e.g., "COMPLETED") */
  status: string;
  /** Subtotal in integer cents */
  subtotal: number;
  /** Shipping cost in integer cents */
  shippingTotal: number;
  /** Tax amount in integer cents */
  taxTotal: number;
  /** Grand total in integer cents */
  total: number;
  /** ISO 4217 currency code */
  currency: string;
  /** Per-merchant bags with their items */
  bags: PersistOrderBagInput[];
}

/**
 * Input for persisting a single merchant bag within an order.
 *
 * @see {@link OrderBag} — the Violet API response type this maps from
 */
export interface PersistOrderBagInput {
  /** Violet's numeric bag ID (as string) */
  violetBagId: string;
  /** Violet merchant ID — FK to merchants table */
  merchantId: string;
  /** Merchant display name */
  merchantName: string;
  /** Bag fulfillment status from Violet */
  status: string;
  /** Bag financial status from Violet */
  financialStatus: string;
  /**
   * Bag fulfillment/delivery status — tracks shipping progress independently.
   * PROCESSING → SHIPPED → DELIVERED (standard flow).
   */
  fulfillmentStatus: string;
  /** Subtotal in integer cents */
  subtotal: number;
  /** Shipping cost in integer cents */
  shippingTotal: number;
  /** Tax amount in integer cents */
  taxTotal: number;
  /** Bag total in integer cents */
  total: number;
  /** Shipping method label — absent pre-shipment */
  shippingMethod?: string;
  /** Shipping carrier name — absent pre-shipment */
  carrier?: string;
  /** Commission rate (%) from Violet — snapshotted at order time. */
  commissionRate: number;
  /** Line items (SKUs) in this bag */
  items: PersistOrderItemInput[];
}

/**
 * Input for persisting a single line item (SKU) within a bag.
 *
 * @see {@link OrderBagItem} — the Violet API response type this maps from
 */
export interface PersistOrderItemInput {
  /** Violet SKU ID (as string) */
  skuId: string;
  /** Product/variant display name */
  name: string;
  /** Quantity ordered */
  quantity: number;
  /** Unit price in integer cents */
  price: number;
  /** Line total in integer cents (price x quantity) */
  linePrice: number;
  /** Product thumbnail URL */
  thumbnail?: string;
}

/**
 * Result of order persistence via {@link persistOrder}.
 *
 * - `orderId`: Supabase-generated UUID for the new order row
 * - `orderLookupToken`: Only present for guest checkouts — the plaintext token
 *   shown once on the confirmation page. The SHA-256 hash is stored in the DB;
 *   this plaintext is never persisted.
 */
export interface PersistOrderResult {
  /** Supabase UUID of the created order row */
  orderId: string;
  /** Plaintext guest lookup token — present only for guest (non-authenticated) orders */
  orderLookupToken?: string;
}
