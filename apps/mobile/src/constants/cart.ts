/**
 * SecureStore key for persisting the Violet cart ID across app restarts.
 *
 * Single source of truth — import from here instead of defining local constants.
 * Used by: cart.tsx, products/[productId].tsx, _layout.tsx, checkout.tsx,
 * checkoutHooks.ts, AuthContext.tsx.
 */
export const CART_STORAGE_KEY = "violet_cart_id" as const;
