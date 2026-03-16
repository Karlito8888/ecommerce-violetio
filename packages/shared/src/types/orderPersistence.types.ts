/** Supabase row type for orders table — distinct from Violet's OrderDetail */
export interface OrderRow {
  id: string;
  violet_order_id: string;
  user_id: string | null;
  session_id: string | null;
  email: string;
  status: string;
  subtotal: number;
  shipping_total: number;
  tax_total: number;
  total: number;
  currency: string;
  order_lookup_token_hash: string | null;
  email_sent: boolean;
  created_at: string;
  updated_at: string;
}

/** Supabase row type for order_bags table */
export interface OrderBagRow {
  id: string;
  order_id: string;
  violet_bag_id: string;
  merchant_name: string;
  status: string;
  financial_status: string;
  subtotal: number;
  shipping_total: number;
  tax_total: number;
  total: number;
  shipping_method: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
  carrier: string | null;
  created_at: string;
  updated_at: string;
}

/** Supabase row type for order_items table */
export interface OrderItemRow {
  id: string;
  order_bag_id: string;
  sku_id: string;
  name: string;
  quantity: number;
  price: number;
  line_price: number;
  thumbnail: string | null;
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

/** Input for persisting an order (from OrderDetail) */
export interface PersistOrderInput {
  violetOrderId: string;
  userId: string | null;
  sessionId: string | null;
  email: string;
  status: string;
  subtotal: number;
  shippingTotal: number;
  taxTotal: number;
  total: number;
  currency: string;
  bags: PersistOrderBagInput[];
}

export interface PersistOrderBagInput {
  violetBagId: string;
  merchantName: string;
  status: string;
  financialStatus: string;
  subtotal: number;
  shippingTotal: number;
  taxTotal: number;
  total: number;
  shippingMethod?: string;
  carrier?: string;
  items: PersistOrderItemInput[];
}

export interface PersistOrderItemInput {
  skuId: string;
  name: string;
  quantity: number;
  price: number;
  linePrice: number;
  thumbnail?: string;
}

/** Result of order persistence */
export interface PersistOrderResult {
  orderId: string;
  orderLookupToken?: string;
}
