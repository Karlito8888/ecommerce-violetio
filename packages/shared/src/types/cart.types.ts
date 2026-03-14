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
