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
  /** Subtotal in integer cents (before discount) */
  subtotal: number;
  /** Tax in integer cents */
  tax: number;
  /** Shipping total in integer cents */
  shippingTotal: number;
  /** Discount total in integer cents — sum of all APPLIED discounts after pricing */
  discountTotal: number;
  /** Per-bag errors from Violet (e.g., "Item X out of stock") */
  errors: BagError[];
  /** Discount codes applied to this bag — only APPLIED are used at submit */
  discounts: DiscountItem[];
  /**
   * True when ALL items in this bag are DIGITAL/VIRTUAL/BUNDLED (no shipping needed).
   * When true, shipping method selection is skipped during checkout.
   *
   * @see https://docs.violet.io/prism/catalog/skus — Digital Product Delivery
   */
  isDigital: boolean;
  /**
   * Merchant's default country code (ISO 3166-1 alpha-2, e.g., "US", "GB").
   * Enriched from our `merchants` table during cart fetch.
   * Used for cross-border duty detection on checkout.
   *
   * `null` when the merchant's country is unknown (not yet synced).
   */
  merchantCountryCode: string | null;
}

/**
 * Structured per-bag error from Violet's 200-with-errors pattern.
 *
 * ## Violet documented fields (from lifecycle-of-a-cart.md)
 * - `type`: error category (e.g., "EXTERNAL_SUBMISSION_FAILED")
 * - `bag_id`: which bag the error belongs to
 * - `entity_type`: "order_sku" (item-level) or "bag" (bag-level)
 * - `external_platform`: originating platform (e.g., "SHOPIFY")
 *
 * The `code` field may also appear — some Violet responses use `code` instead of `type`.
 * We capture both for resilience.
 *
 * @see https://docs.violet.io/prism/checkout-guides/carts-and-bags/carts/lifecycle-of-a-cart
 */
export interface BagError {
  code: string;
  message: string;
  skuId?: string;
  /** Violet bag ID associated with this error (present on submit-level errors) */
  bagId?: string;
  /** Violet error category (e.g., "EXTERNAL_SUBMISSION_FAILED", "EXTERNAL_SUBMIT_CART") */
  type?: string;
  /** Error entity type from Violet (e.g., "SKU", "order_sku", "bag") */
  entityType?: string;
  /** Originating external platform (e.g., "SHOPIFY") */
  externalPlatform?: string;
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
  status: "active" | "completed" | "abandoned" | "merged";
  /**
   * Stripe PaymentIntent client secret — only present when cart was created
   * with `wallet_based_checkout: true` in the Violet API.
   *
   * Used to initialize Stripe's `<Elements>` provider on the checkout page.
   * This value is fetched server-side (via `getPaymentIntentFn`) and passed
   * to the client only for Stripe SDK consumption — never stored in cookies
   * or localStorage.
   *
   * @see https://docs.violet.io/guides/checkout/payments
   * @see Story 4.4 AC#5
   */
  paymentIntentClientSecret?: string;
  /**
   * True when ALL bags in the cart are digital (no shipping needed for any bag).
   * When true, the entire shipping method selection step is skipped during checkout.
   * Derived from `bag.isDigital` on every bag.
   *
   * @see https://docs.violet.io/prism/catalog/skus — Digital Product Delivery
   */
  allBagsDigital: boolean;
}

/** A single line item in a cart bag. */
export interface CartItem {
  id: string;
  skuId: string;
  /**
   * Optional because Violet doesn't return product_id in cart SKU responses.
   * Only populated when stored from product detail page context.
   */
  productId?: string;
  quantity: number;
  /** Unit price in integer cents */
  unitPrice: number;
  /** Product name — enriched from Supabase cart_items at get-cart time */
  name?: string;
  /** Product thumbnail URL — enriched from Supabase cart_items at get-cart time */
  thumbnailUrl?: string;
  /**
   * Product type from Violet (PHYSICAL, DIGITAL, VIRTUAL, BUNDLED).
   * Used to skip shipping method selection for DIGITAL products.
   * Defaults to "PHYSICAL" when not provided by Violet.
   *
   * @see https://docs.violet.io/prism/catalog/skus — Product Types
   */
  type: "PHYSICAL" | "DIGITAL" | "VIRTUAL" | "BUNDLED";
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

// ─── Cart Sync (Story 4.6) ──────────────────────────────────────────────────

/**
 * Supabase Realtime event for cart changes — used as a cache-invalidation signal.
 *
 * With RLS enabled on the `carts` table, Supabase Realtime only sends the
 * primary key to clients. We use this event to know THAT a cart changed,
 * then refetch the actual data from Violet (source of truth).
 */
export interface CartSyncEvent {
  /** Supabase cart UUID (primary key from the Realtime payload) */
  cartId: string;
  /** Violet cart ID for API calls */
  violetCartId: string;
  /** Event type from Supabase Realtime */
  eventType: "INSERT" | "UPDATE" | "DELETE";
}

/** Input for creating a new cart (caller provides session context). */
export interface CreateCartInput {
  /** Supabase user UUID or null for anonymous */
  userId: string | null;
  /** Anonymous session ID for guest carts */
  sessionId: string | null;

  // ─── Quick Checkout fields (optional) ───────────────────────────────
  // When provided, Violet processes SKUs + customer + address in a single
  // call, reducing e-commerce API requests from ~8 to ~4.
  // @see https://docs.violet.io/prism/checkout-guides/guides/utilizing-quick-checkout

  /** SKU(s) to add at cart creation time (Quick Checkout). */
  skus?: Array<{ skuId: string; quantity: number }>;

  /** Customer info + shipping address (Quick Checkout). */
  customer?: CustomerInput & {
    shippingAddress: ShippingAddressInput;
    /** If true, billing address = shipping address (default: true) */
    sameAddress?: boolean;
    billingAddress?: ShippingAddressInput;
  };
}

// ─── Customer (Story 4.4) ──────────────────────────────────────────────────

/**
 * Guest customer information sent to Violet before payment.
 *
 * ## Violet API mapping (camelCase → snake_case on the wire)
 * - `email`      → `email`
 * - `firstName`  → `first_name`
 * - `lastName`   → `last_name`
 *
 * ## Marketing consent (FR20)
 * `marketingConsent` maps to Violet's `communication_preferences` array,
 * which is per-merchant (per-bag). When true, we include `[{ enabled: true }]`
 * for all bags. The checkbox is unchecked by default per UX spec.
 *
 * @see https://docs.violet.io/api-reference/checkout-cart/apply-guest-customer-to-cart
 * @see Story 4.4 AC#1, AC#2
 */
export interface CustomerInput {
  email: string;
  firstName: string;
  lastName: string;
  /** Per-merchant marketing opt-in (FR20). false by default. */
  marketingConsent?: boolean;
}

// ─── Discounts ──────────────────────────────────────────────────────────────

/**
 * Discount status as defined by Violet.
 *
 * - `PENDING`: Discount added, not yet validated by merchant platform (WooCommerce, ECWID)
 * - `APPLIED`: Validated and applied by merchant platform — will be used at submit
 * - `INVALID`: Code not recognized by platform — auto-removed at submit
 * - `NOT_SUPPORTED`: Platform does not support discount codes
 * - `ERROR`: Unexpected error — auto-removed at submit
 * - `EXPIRED`: Previously applied but no longer valid — auto-removed at submit
 *
 * Discounts are **non-blocking**: only `APPLIED` discounts are considered at
 * order submission. All other statuses are silently removed.
 *
 * @see https://docs.violet.io/prism/checkout-guides/discounts
 */
export type DiscountStatus =
  | "PENDING"
  | "APPLIED"
  | "INVALID"
  | "NOT_SUPPORTED"
  | "ERROR"
  | "EXPIRED";

/**
 * A discount code applied to a merchant bag within the cart.
 *
 * Violet validates each code against the merchant's e-commerce platform.
 * `amountTotal` and `valueType` are only populated after the cart is priced.
 *
 * @see https://docs.violet.io/prism/checkout-guides/discounts/applying-discounts
 */
export interface DiscountItem {
  /** Violet discount ID */
  id: string;
  /** Bag this discount belongs to */
  bagId: string;
  /** Current status — only APPLIED discounts are used at submit */
  status: DiscountStatus;
  /** Discount type: "CODE" for promo codes */
  type: string;
  /** The promo code entered by the shopper */
  code: string;
  /** "PERCENTAGE" or "AMOUNT" — only available after pricing
   * @see https://docs.violet.io/prism/checkout-guides/discounts/applying-discounts
   */
  valueType?: string;
  /** Discount amount in integer cents — only available after pricing */
  amountTotal?: number;
  /** ISO 8601 creation date */
  dateCreated?: string;
}

/**
 * Input for applying a discount code to a cart.
 *
 * `merchantId` must match a merchant that has SKUs in the cart, otherwise
 * the discount is silently ignored by Violet.
 *
 * `email` is optional and used for customer-restricted discounts (e.g.,
 * "Once Per Customer"). Takes priority over the cart-level customer email.
 *
 * @see https://docs.violet.io/prism/checkout-guides/discounts/applying-discounts
 */
export interface DiscountInput {
  /** The discount/promo code */
  code: string;
  /** Merchant ID that this code applies to */
  merchantId: string;
  /** Optional email for customer-restricted discounts */
  email?: string;
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
