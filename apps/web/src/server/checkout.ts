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
import { getCookie, setCookie } from "@tanstack/react-start/server";
import type {
  ApiResponse,
  Cart,
  CustomerInput,
  PaymentIntent,
  OrderSubmitResult,
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

// ─── Story 4.4: Customer, Billing, Payment, Submit ──────────────────────

/**
 * Sets guest customer info on the active cart.
 *
 * ## Flow
 * Called after shipping confirmation, before billing/payment.
 * Maps `CustomerInput` (camelCase) → Violet snake_case body.
 *
 * ## Marketing consent (FR20)
 * When `marketingConsent` is true, includes `communication_preferences`
 * in the Violet payload. Unchecked by default per UX spec.
 *
 * @see https://docs.violet.io/api-reference/checkout-cart/apply-guest-customer-to-cart
 */
export const setCustomerFn = createServerFn({ method: "POST" })
  .inputValidator((data: CustomerInput) => data)
  .handler(async ({ data }): Promise<ApiResponse<void>> => {
    const violetCartId = getCookie("violet_cart_id");
    if (!violetCartId) {
      return { data: null, error: { code: "NO_CART", message: "No active cart" } };
    }
    const adapter = getAdapter();
    return adapter.setCustomer(violetCartId, data);
  });

/**
 * Sets a billing address different from shipping on the active cart.
 *
 * Only called when the user unchecks "Same as shipping address".
 * If billing matches shipping, this call is skipped entirely.
 *
 * ## Violet billing_address body
 * Same shape as shipping_address but WITHOUT `phone` field.
 * We reuse `ShippingAddressInput` as the input type for convenience —
 * the `phone` field (if present) is stripped by `VioletAdapter.setBillingAddress`
 * before sending to Violet.
 *
 * @see https://docs.violet.io/api-reference/checkout-cart/set-billing-address
 */
export const setBillingAddressFn = createServerFn({ method: "POST" })
  .inputValidator((data: ShippingAddressInput) => data)
  .handler(async ({ data }): Promise<ApiResponse<void>> => {
    const violetCartId = getCookie("violet_cart_id");
    if (!violetCartId) {
      return { data: null, error: { code: "NO_CART", message: "No active cart" } };
    }
    const adapter = getAdapter();
    return adapter.setBillingAddress(violetCartId, data);
  });

/**
 * Retrieves the Stripe PaymentIntent client secret for the active cart.
 *
 * ## How it works
 * Performs a GET /checkout/cart/{id} server-side and extracts
 * `payment_intent_client_secret` from the response. Only works for carts
 * created with `wallet_based_checkout: true`.
 *
 * ## Security
 * The client secret is safe to send to the browser — Stripe's SDK requires it
 * to render the PaymentElement. It cannot be used to charge without the full
 * Stripe secret key (which stays on Stripe's servers).
 *
 * @returns `PaymentIntent` with `clientSecret`, `amount`, `currency`
 */
export const getPaymentIntentFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<ApiResponse<PaymentIntent>> => {
    const violetCartId = getCookie("violet_cart_id");
    if (!violetCartId) {
      return { data: null, error: { code: "NO_CART", message: "No active cart" } };
    }
    const adapter = getAdapter();
    return adapter.getPaymentIntent(violetCartId);
  },
);

/**
 * Submits the order to Violet after Stripe payment authorization.
 *
 * ## Complete checkout flow
 * 1. Client: `stripe.confirmPayment()` — authorizes card (does NOT charge)
 * 2. This function: POST /checkout/cart/{id}/submit — Violet charges the card
 * 3. If REQUIRES_ACTION: client calls `stripe.handleNextAction()` for 3DS
 * 4. Re-submit with same `appOrderId` for idempotency
 *
 * ## Important: `confirmPayment` does NOT charge
 * The card is charged ONLY after a successful `/submit`. If submit fails,
 * the authorization falls off within a few business days — the user is NOT charged.
 *
 * @see https://docs.violet.io/api-reference/checkout-cart/submit-cart
 */
export const submitOrderFn = createServerFn({ method: "POST" })
  .inputValidator((data: { appOrderId: string }) => data)
  .handler(async ({ data }): Promise<ApiResponse<OrderSubmitResult>> => {
    const violetCartId = getCookie("violet_cart_id");
    if (!violetCartId) {
      return { data: null, error: { code: "NO_CART", message: "No active cart" } };
    }
    const adapter = getAdapter();
    return adapter.submitOrder(violetCartId, data.appOrderId);
  });

/**
 * Clears the `violet_cart_id` HttpOnly cookie after a successful order.
 *
 * Called after submit returns COMPLETED — prevents stale cart ID from causing
 * errors when the user starts a new cart (old cart is already submitted).
 *
 * Uses `maxAge: 0` to immediately expire the cookie (no `deleteCookie` in
 * TanStack Start — `setCookie` with zero max-age is the standard approach).
 */
export const clearCartCookieFn = createServerFn({ method: "POST" }).handler(async () => {
  setCookie("violet_cart_id", "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return { data: null, error: null };
});
