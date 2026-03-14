/**
 * Checkout Server Functions — shipping address, shipping method selection.
 *
 * ## Architecture
 *
 * These Server Functions are the security boundary for the checkout flow.
 * The Violet token NEVER reaches the client — all Violet API calls happen here,
 * server-side, via the `VioletAdapter` singleton (`getAdapter()`).
 *
 * ## Sequence (enforced by UI, not here)
 * 1. `setShippingAddressFn` — set address first (required by Violet before step 2)
 * 2. `getAvailableShippingMethodsFn` — fetch carrier rates (slow: 2–5s)
 * 3. `setShippingMethodsFn` — apply selections → returns priced cart
 *
 * All functions read `violet_cart_id` from the HttpOnly cookie set at cart creation.
 * The `{ data, error }` pattern is used throughout for consistent error handling.
 *
 * @see apps/web/src/server/cartActions.ts — same pattern (security boundary + cookie read)
 * @see packages/shared/src/adapters/violetAdapter.ts — shipping methods implementation
 * @see https://docs.violet.io/api-reference/checkout/cart/set-shipping-address
 * @see https://docs.violet.io/api-reference/checkout/cart/get-available-shipping-methods
 * @see https://docs.violet.io/api-reference/checkout/cart/set-shipping-methods
 */

import { createServerFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";
import type {
  ApiResponse,
  Cart,
  ShippingAddressInput,
  ShippingMethodsAvailable,
  SetShippingMethodInput,
} from "@ecommerce/shared";
import { getAdapter } from "./violetAdapter";

/**
 * Sets the shipping address for the active cart.
 *
 * ## Flow
 * 1. Read `violet_cart_id` from HttpOnly cookie
 * 2. Map `ShippingAddressInput` (camelCase) → Violet snake_case body (done in VioletAdapter)
 * 3. POST to `/checkout/cart/{id}/shipping_address`
 * 4. Return `{ data: null, error: null }` on success
 *
 * Call this BEFORE `getAvailableShippingMethodsFn` — Violet requires a shipping
 * address before it can query carrier APIs for rates.
 *
 * @returns `ApiResponse<void>` — success has `data: null, error: null`
 */
export const setShippingAddressFn = createServerFn({ method: "POST" })
  .inputValidator((data: ShippingAddressInput) => data)
  .handler(async ({ data: address }): Promise<ApiResponse<void>> => {
    const violetCartId = getCookie("violet_cart_id");
    if (!violetCartId) {
      return { data: null, error: { code: "NO_CART", message: "No active cart" } };
    }
    const adapter = getAdapter();
    return adapter.setShippingAddress(violetCartId, address);
  });

/**
 * Fetches available shipping methods for all merchant bags in the active cart.
 *
 * ## Performance note
 * This call is intentionally slow (2–5 seconds) — Violet queries third-party
 * carrier APIs in real-time. The UI must show a per-bag skeleton loader.
 *
 * ## Prerequisite
 * `setShippingAddressFn` must be called first. If called without an address,
 * Violet may return empty results or an error.
 *
 * @returns Array of `ShippingMethodsAvailable` (one per merchant bag)
 */
export const getAvailableShippingMethodsFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<ApiResponse<ShippingMethodsAvailable[]>> => {
    const violetCartId = getCookie("violet_cart_id");
    if (!violetCartId) {
      return { data: null, error: { code: "NO_CART", message: "No active cart" } };
    }
    const adapter = getAdapter();
    return adapter.getAvailableShippingMethods(violetCartId);
  },
);

/**
 * Applies shipping method selections for all bags and returns the "priced cart".
 *
 * ## Why this returns `ApiResponse<Cart>`
 * Violet's POST /shipping response is the full cart with updated `shipping_total`
 * per bag. We return it so the UI can update totals immediately without a refetch.
 *
 * ## Body format
 * `{ selections: [{ bagId, shippingMethodId }] }` — one selection per merchant bag.
 * All bags must have a selection before calling this (UI enforces this invariant).
 *
 * @returns Updated `Cart` with non-zero `shippingTotal` per bag
 */
export const setShippingMethodsFn = createServerFn({ method: "POST" })
  .inputValidator((data: { selections: SetShippingMethodInput[] }) => data)
  .handler(async ({ data }): Promise<ApiResponse<Cart>> => {
    const violetCartId = getCookie("violet_cart_id");
    if (!violetCartId) {
      return { data: null, error: { code: "NO_CART", message: "No active cart" } };
    }
    const adapter = getAdapter();
    return adapter.setShippingMethods(violetCartId, data.selections);
  });
