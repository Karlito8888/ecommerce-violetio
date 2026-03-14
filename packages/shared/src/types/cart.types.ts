/**
 * Cart-related types for Story 4.1 — Cart Creation & Item Management.
 *
 * ## Violet Cart Model
 * One `Cart` contains multiple `Bags` (one per merchant). Violet manages bag
 * grouping automatically — we submit sku_ids and Violet assigns items to the
 * correct merchant Bag.
 *
 * ## ID conventions
 * - `Cart.id` — Supabase UUID (used for all Supabase DB operations)
 * - `Cart.violetCartId` — Violet integer cart ID as string (used for Violet API calls)
 * - `Bag.id` — Violet bag integer ID as string
 * - `CartItem.skuId` — Violet SKU integer ID as string
 *
 * All values are strings in our internal types even if Violet returns numbers,
 * to avoid JS integer precision issues with large Violet IDs.
 */

/**
 * A Violet "bag" — groups items from one merchant within a cart.
 * Violet creates and manages bags automatically when SKUs are added.
 */
export interface Bag {
  id: string;
  merchantId: string;
  merchantName: string;
  items: CartItem[];
  /** Subtotal in integer cents */
  subtotal: number;
  /** Tax in integer cents */
  tax: number;
  /** Shipping total in integer cents */
  shippingTotal: number;
  /** Per-bag errors from Violet (e.g., "Item X out of stock") */
  errors: BagError[];
}

/** Structured per-bag error from Violet's 200-with-errors pattern. */
export interface BagError {
  code: string;
  message: string;
  skuId?: string;
}

/** The unified cart across all merchants (Supabase + Violet combined view). */
export interface Cart {
  /** Supabase cart UUID */
  id: string;
  /** Violet cart integer ID (as string) — used for Violet API calls */
  violetCartId: string;
  /** Supabase user UUID (null for anonymous users) */
  userId: string | null;
  /** Anonymous session ID — matches Supabase anonymous user id */
  sessionId: string | null;
  bags: Bag[];
  /** Total in integer cents */
  total: number;
  currency: string;
  status: "active" | "completed" | "abandoned";
}

/** A single line item in a cart bag. */
export interface CartItem {
  id: string;
  skuId: string;
  productId: string;
  quantity: number;
  /** Unit price in integer cents */
  unitPrice: number;
  /** Product name — enriched from Supabase cart_items at get-cart time */
  name?: string;
  /** Product thumbnail URL — enriched from Supabase cart_items at get-cart time */
  thumbnailUrl?: string;
}

/** Input payload for adding an item to the cart. */
export interface CartItemInput {
  skuId: string;
  quantity: number;
  /** Product name to store in Supabase cart_items for display purposes */
  productName?: string;
  /** Product thumbnail URL to store in Supabase cart_items for display purposes */
  thumbnailUrl?: string;
}

/** Input for creating a new cart (caller provides session context). */
export interface CreateCartInput {
  /** Supabase user UUID or null for anonymous */
  userId: string | null;
  /** Anonymous session ID for guest carts */
  sessionId: string | null;
}

// ─── Shipping (Story 4.3) ──────────────────────────────────────────────────

/**
 * A single shipping method offered by a carrier for a specific Violet bag.
 *
 * ## Field name origins (Violet → internal)
 * - `id`: Violet `shipping_method_id` (string or number, normalized to string)
 * - `label`: Violet `label` OR `name` field (Violet may use either)
 * - `minDays` / `maxDays`: Violet `min_days` / `max_days`
 * - `price`: Violet `price` in integer cents
 *
 * @see packages/shared/src/schemas/cart.schema.ts — violetShippingMethodSchema
 * @see https://docs.violet.io/api-reference/checkout/cart/get-available-shipping-methods
 */
export interface ShippingMethod {
  /** Shipping method identifier (used in POST /checkout/cart/{id}/shipping body) */
  id: string;
  /** Display name — falls back to Violet's `name` field if `label` is absent */
  label: string;
  /** Carrier name (e.g., "USPS", "FedEx") — optional, Violet may omit */
  carrier?: string;
  /** Minimum estimated delivery days */
  minDays?: number;
  /** Maximum estimated delivery days */
  maxDays?: number;
  /** Shipping cost in integer cents */
  price: number;
}

/**
 * Shipping methods available for one merchant bag.
 *
 * Violet returns one entry per bag from GET /checkout/cart/{id}/shipping/available.
 * `bagId` is the Violet integer bag ID, normalized to string for our ID conventions.
 *
 * @see VioletAdapter.getAvailableShippingMethods
 */
export interface ShippingMethodsAvailable {
  /** Violet bag integer ID as string */
  bagId: string;
  /** Available shipping methods for this bag (may be empty if carrier APIs fail) */
  shippingMethods: ShippingMethod[];
}

/**
 * Customer shipping address — sent to Violet before fetching available methods.
 *
 * ## Violet API field mapping (camelCase → snake_case on the wire)
 * - `address1`    → `address_1`
 * - `postalCode`  → `postal_code`
 * - `country`     → `country` (ISO 3166-1 alpha-2, e.g., "US")
 *
 * ## Confirmed Violet fields (from docs.violet.io/prism/checkout-guides)
 * - `address_1`, `city`, `state`, `postal_code`, `country`, `phone`
 *
 * `name` and `email` belong to the Customer object (POST /customer, Story 4.4),
 * NOT the shipping address. Do not include them in this payload.
 *
 * @see VioletAdapter.setShippingAddress
 * @see https://docs.violet.io/api-reference/order-service/checkout-shipping/set-shipping-address
 */
export interface ShippingAddressInput {
  address1: string;
  city: string;
  state: string;
  postalCode: string;
  /** ISO 3166-1 alpha-2 country code (e.g., "US", "GB", "DE") */
  country: string;
  /** Contact phone for carrier delivery notifications (optional) */
  phone?: string;
}

/**
 * Shipping method selection for one bag — sent in the POST /checkout/cart/{id}/shipping body.
 *
 * ## Violet API field mapping (camelCase → snake_case on the wire)
 * - `bagId`             → `bag_id` (as integer)
 * - `shippingMethodId`  → `shipping_method_id`
 *
 * @see VioletAdapter.setShippingMethods
 * @see https://docs.violet.io/api-reference/checkout/cart/set-shipping-methods
 */
export interface SetShippingMethodInput {
  /** Violet bag integer ID as string */
  bagId: string;
  /** Shipping method ID from ShippingMethod.id */
  shippingMethodId: string;
}
