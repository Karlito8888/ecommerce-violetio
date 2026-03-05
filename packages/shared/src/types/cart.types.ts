/**
 * Cart-related placeholder types.
 * Full implementation in Story 4.1 (cart creation & item management).
 */

/**
 * A Violet "bag" — the top-level cart container.
 * In Violet's model, one Cart can contain multiple Bags (one per merchant).
 */
export interface Bag {
  id: string;
  merchantId: string;
  items: CartItem[];
  /** Subtotal in integer cents */
  subtotal: number;
}

/** The unified cart across all merchants. */
export interface Cart {
  id: string;
  userId: string;
  bags: Bag[];
  /** Total in integer cents */
  total: number;
  currency: string;
}

/** A single line item in a cart. */
export interface CartItem {
  id: string;
  skuId: string;
  productId: string;
  quantity: number;
  /** Unit price in integer cents */
  unitPrice: number;
}

/** Input payload for adding an item to the cart. */
export interface CartItemInput {
  skuId: string;
  quantity: number;
}
