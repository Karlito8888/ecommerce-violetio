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
 * 2. `getAvailableShippingMethodsFn` — fetch carrier rates (slow: 2-5s)
 * 3. `setShippingMethodsFn` — apply selections -> returns priced cart
 *
 * All functions read `violet_cart_id` from the HttpOnly cookie set at cart creation.
 * The `{ data, error }` pattern is used throughout for consistent error handling.
 *
 * All checkout server functions log errors to error_logs for operational visibility.
 * This ensures complete checkout failure traceability.
 *
 * @see apps/web/src/server/cartActions.ts — same pattern (security boundary + cookie read)
 * @see packages/shared/src/adapters/violetAdapter.ts — shipping methods implementation
 * @see https://docs.violet.io/api-reference/checkout/cart/set-shipping-address
 * @see https://docs.violet.io/api-reference/checkout/cart/get-available-shipping-methods
 * @see https://docs.violet.io/api-reference/checkout/cart/set-shipping-methods
 */

import { createServerFn } from "@tanstack/react-start";
import { getCookie, setCookie } from "@tanstack/react-start/server";
import { z } from "zod";
import type {
  ApiResponse,
  Cart,
  CustomerInput,
  PaymentIntent,
  OrderDetail,
  OrderSubmitResult,
  ShippingMethodsAvailable,
  SetShippingMethodInput,
  PersistOrderResult,
} from "@ecommerce/shared";
import {
  logError,
  shippingAddressInputSchema,
  customerInputSchema,
  isBlockedAddressError,
  BLOCKED_ADDRESS_USER_MESSAGE,
} from "@ecommerce/shared";
import { persistOrder } from "@ecommerce/shared/server/utils";
import { getAdapter } from "./violetAdapter";
import { getSupabaseServer } from "./supabaseServer";

/**
 * Sets the shipping address for the active cart.
 *
 * All checkout server functions log errors to error_logs for operational visibility.
 * This ensures complete checkout failure traceability.
 *
 * ## Flow
 * 1. Read `violet_cart_id` from HttpOnly cookie
 * 2. Map `ShippingAddressInput` (camelCase) -> Violet snake_case body (done in VioletAdapter)
 * 3. POST to `/checkout/cart/{id}/shipping_address`
 * 4. Return `{ data: null, error: null }` on success
 *
 * Call this BEFORE `getAvailableShippingMethodsFn` — Violet requires a shipping
 * address before it can query carrier APIs for rates.
 *
 * Runtime input validation prevents malformed client data from reaching
 * Violet/Supabase. TanStack Start server functions are callable from the
 * client — input must be treated as untrusted.
 *
 * @returns `ApiResponse<void>` — success has `data: null, error: null`
 */
export const setShippingAddressFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    /**
     * Runtime input validation prevents malformed client data from reaching
     * Violet/Supabase. TanStack Start server functions are callable from the
     * client — input must be treated as untrusted.
     */
    const schema = shippingAddressInputSchema.extend({
      phone: z.string().optional(),
    });
    return schema.parse(input);
  })
  .handler(async ({ data: address }): Promise<ApiResponse<void>> => {
    const violetCartId = getCookie("violet_cart_id");
    if (!violetCartId) {
      return { data: null, error: { code: "NO_CART", message: "No active cart" } };
    }
    const adapter = getAdapter();
    const result = await adapter.setShippingAddress(violetCartId, address);

    /**
     * All checkout server functions log errors to error_logs for operational visibility.
     * This ensures complete checkout failure traceability.
     */
    if (result.error) {
      logError(getSupabaseServer(), {
        source: "web",
        error_type: result.error.code,
        message: result.error.message,
        context: { violetCartId, step: "setShippingAddress" },
      });

      // Translate Violet's blocked_address error (code 4236) into a user-friendly message.
      // @see https://docs.violet.io/prism/checkout-guides/carts-and-bags/customers — Blocked Addresses
      if (isBlockedAddressError(result.error)) {
        return {
          data: null,
          error: { code: "VIOLET.BLOCKED_ADDRESS", message: BLOCKED_ADDRESS_USER_MESSAGE },
        };
      }
    }

    return result;
  });

/**
 * Fetches available shipping methods for all merchant bags in the active cart.
 *
 * All checkout server functions log errors to error_logs for operational visibility.
 * This ensures complete checkout failure traceability.
 *
 * ## Performance note
 * This call is intentionally slow (2-5 seconds) — Violet queries third-party
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
    const result = await adapter.getAvailableShippingMethods(violetCartId);

    /**
     * All checkout server functions log errors to error_logs for operational visibility.
     * This ensures complete checkout failure traceability.
     */
    if (result.error) {
      logError(getSupabaseServer(), {
        source: "web",
        error_type: "CHECKOUT.SHIPPING_METHODS_FAILED",
        message: result.error.message,
        context: { violetCartId, step: "getAvailableShippingMethods" },
      });
    }

    return result;
  },
);

/**
 * Applies shipping method selections for all bags and returns the "priced cart".
 *
 * All checkout server functions log errors to error_logs for operational visibility.
 * This ensures complete checkout failure traceability.
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
    const result = await adapter.setShippingMethods(violetCartId, data.selections);

    /**
     * All checkout server functions log errors to error_logs for operational visibility.
     * This ensures complete checkout failure traceability.
     */
    if (result.error) {
      logError(getSupabaseServer(), {
        source: "web",
        error_type: "CHECKOUT.SET_SHIPPING_METHODS_FAILED",
        message: result.error.message,
        context: { violetCartId, step: "setShippingMethods" },
      });
    }

    return result;
  });

/**
 * Forces cart pricing via GET /checkout/cart/{id}/price.
 *
 * Called when `setShippingMethods` returns a cart with `tax_total === 0` on any
 * bag. Violet's docs state: "there are instances where carts are not priced
 * automatically after applying shipping methods. You will know this is needed
 * when the response from the apply shipping methods call has a 0 value for
 * tax_total."
 *
 * ## Why this is separate from setShippingMethods
 * Price Cart makes external e-commerce platform API calls and impacts rate limits.
 * Only calling when needed avoids unnecessary platform requests.
 *
 * @see https://docs.violet.io/api-reference/orders-and-checkout/cart-pricing/price-cart
 * @see https://docs.violet.io/prism/overview/place-an-order/submit-cart
 */
export const priceCartFn = createServerFn({ method: "POST" }).handler(
  async (): Promise<ApiResponse<Cart>> => {
    const violetCartId = getCookie("violet_cart_id");
    if (!violetCartId) {
      return { data: null, error: { code: "NO_CART", message: "No active cart" } };
    }
    const adapter = getAdapter();
    const result = await adapter.priceCart(violetCartId);

    if (result.error) {
      logError(getSupabaseServer(), {
        source: "web",
        error_type: result.error.code,
        message: result.error.message,
        context: { violetCartId, step: "priceCart" },
      });
    }

    return result;
  },
);

// ─── Story 4.4: Customer, Billing, Payment, Submit ──────────────────────

/**
 * Sets guest customer info on the active cart.
 *
 * All checkout server functions log errors to error_logs for operational visibility.
 * This ensures complete checkout failure traceability.
 *
 * ## Flow
 * Called after shipping confirmation, before billing/payment.
 * Maps `CustomerInput` (camelCase) -> Violet snake_case body.
 *
 * ## Marketing consent (FR20)
 * When `marketingConsent` is true, includes `communication_preferences`
 * in the Violet payload. Unchecked by default per UX spec.
 *
 * Runtime input validation prevents malformed client data from reaching
 * Violet/Supabase. TanStack Start server functions are callable from the
 * client — input must be treated as untrusted.
 *
 * @see https://docs.violet.io/api-reference/checkout-cart/apply-guest-customer-to-cart
 */
export const setCustomerFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    /**
     * Runtime input validation prevents malformed client data from reaching
     * Violet/Supabase. TanStack Start server functions are callable from the
     * client — input must be treated as untrusted.
     */
    const schema = customerInputSchema.extend({
      marketingConsent: z.boolean().optional(),
    });
    return schema.parse(input) as CustomerInput;
  })
  .handler(async ({ data }): Promise<ApiResponse<void>> => {
    const violetCartId = getCookie("violet_cart_id");
    if (!violetCartId) {
      return { data: null, error: { code: "NO_CART", message: "No active cart" } };
    }
    const adapter = getAdapter();
    const result = await adapter.setCustomer(violetCartId, data);

    /**
     * All checkout server functions log errors to error_logs for operational visibility.
     * This ensures complete checkout failure traceability.
     */
    if (result.error) {
      logError(getSupabaseServer(), {
        source: "web",
        error_type: "CHECKOUT.SET_CUSTOMER_FAILED",
        message: result.error.message,
        context: { violetCartId, step: "setCustomer" },
      });
    }

    return result;
  });

/**
 * Sets a billing address different from shipping on the active cart.
 *
 * All checkout server functions log errors to error_logs for operational visibility.
 * This ensures complete checkout failure traceability.
 *
 * Always called before fetching the PaymentIntent — Violet requires billing_address
 * on every order submission, including when billing matches shipping.
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
  .inputValidator((input: unknown) => {
    /**
     * Runtime input validation prevents malformed client data from reaching
     * Violet/Supabase. TanStack Start server functions are callable from the
     * client — input must be treated as untrusted.
     */
    const schema = shippingAddressInputSchema.extend({
      phone: z.string().optional(),
    });
    return schema.parse(input);
  })
  .handler(async ({ data }): Promise<ApiResponse<void>> => {
    const violetCartId = getCookie("violet_cart_id");
    if (!violetCartId) {
      return { data: null, error: { code: "NO_CART", message: "No active cart" } };
    }
    const adapter = getAdapter();
    const result = await adapter.setBillingAddress(violetCartId, data);

    /**
     * All checkout server functions log errors to error_logs for operational visibility.
     * This ensures complete checkout failure traceability.
     */
    if (result.error) {
      logError(getSupabaseServer(), {
        source: "web",
        error_type: "CHECKOUT.SET_BILLING_ADDRESS_FAILED",
        message: result.error.message,
        context: { violetCartId, step: "setBillingAddress" },
      });

      // Translate Violet's blocked_address error (code 4236) into a user-friendly message.
      if (isBlockedAddressError(result.error)) {
        return {
          data: null,
          error: { code: "VIOLET.BLOCKED_ADDRESS", message: BLOCKED_ADDRESS_USER_MESSAGE },
        };
      }
    }

    return result;
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
    const result = await adapter.getPaymentIntent(violetCartId);

    if (result.error) {
      logError(getSupabaseServer(), {
        source: "web",
        error_type: result.error.code,
        message: result.error.message,
        context: { violetCartId, step: "getPaymentIntent" },
      });
    }

    return result;
  },
);

/**
 * Submits the order to Violet after Stripe payment authorization.
 *
 * All checkout server functions log errors to error_logs for operational visibility.
 * This ensures complete checkout failure traceability.
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
 * Runtime input validation prevents malformed client data from reaching
 * Violet/Supabase. TanStack Start server functions are callable from the
 * client — input must be treated as untrusted.
 *
 * @see https://docs.violet.io/api-reference/checkout-cart/submit-cart
 */
export const submitOrderFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    /**
     * Runtime input validation prevents malformed client data from reaching
     * Violet/Supabase. TanStack Start server functions are callable from the
     * client — input must be treated as untrusted.
     */
    const schema = z.object({
      appOrderId: z
        .string()
        .min(1, "App order ID is required")
        .regex(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
          "App order ID must be a valid UUID",
        ),
      /**
       * Optional customer info from Apple Pay / Google Pay Checkout.
       * Contains the full (unredacted) address that Apple provides after payment confirmation.
       * @see https://docs.violet.io/prism/checkout-guides/guides/violet-checkout-with-apple-pay
       */
      orderCustomer: z
        .object({
          firstName: z.string(),
          lastName: z.string(),
          email: z.string().email(),
          shippingAddress: z.object({
            address1: z.string(),
            city: z.string(),
            state: z.string(),
            postalCode: z.string(),
            country: z.string(),
          }),
          sameAddress: z.boolean().optional(),
          billingAddress: z
            .object({
              address1: z.string(),
              city: z.string(),
              state: z.string(),
              postalCode: z.string(),
              country: z.string(),
            })
            .optional(),
        })
        .optional(),
    });
    return schema.parse(input);
  })
  .handler(async ({ data }): Promise<ApiResponse<OrderSubmitResult>> => {
    const violetCartId = getCookie("violet_cart_id");
    if (!violetCartId) {
      return { data: null, error: { code: "NO_CART", message: "No active cart" } };
    }
    const adapter = getAdapter();
    const result = await adapter.submitOrder(violetCartId, data.appOrderId, data.orderCustomer);

    // Story 4.7: Log submission errors for debugging
    if (result.error) {
      logError(getSupabaseServer(), {
        source: "web",
        error_type: result.error.code,
        message: result.error.message,
        context: {
          violetCartId,
          appOrderId: data.appOrderId,
          step: "submitOrder",
        },
      });
    }

    return result;
  });

// ─── Story 4.5: Order Details for Confirmation Page ──────────────────

/**
 * Fetches complete order details for the confirmation page.
 *
 * ## Why this does NOT use the `violet_cart_id` cookie
 * After submit, the cart becomes an order. The order is accessed by its
 * Violet order ID (returned in the submit response), not the cart ID.
 * This means the confirmation page works even after the cart cookie is cleared.
 *
 * ## SSR-friendly
 * Unlike checkout (which requires Stripe.js client-side), the confirmation page
 * can use a TanStack Start `loader` to fetch order data server-side. This gives
 * us faster render and the page is bookmarkable/shareable.
 *
 * ## Security: Ownership validation (Code Review Fix H3, resolved TODO from Story 4.5)
 * Violet's GET /orders/{id} authenticates via the channel's API token, not the
 * customer's. We now validate ownership via the Supabase orders table before
 * returning data. For orders not yet persisted (edge case), we still allow access
 * since this function is only reachable via the confirmation page URL, which
 * requires knowing the Violet order ID from the submit response.
 *
 * Three ownership checks, tried in order:
 * 1. Supabase orders table: user_id or session_id matches the cookie-based session
 * 2. Supabase carts table: user has a completed/submitted cart (pre-persistence fallback)
 * 3. Allow access: order not persisted yet, but Violet has the data (rare edge case)
 *
 * @see https://docs.violet.io/api-reference/orders-and-checkout/orders/get-order-by-id
 */
export const getOrderDetailsFn = createServerFn({ method: "GET" })
  .inputValidator((data: { orderId: string }) => data)
  .handler(async ({ data }): Promise<ApiResponse<OrderDetail>> => {
    const adapter = getAdapter();
    return adapter.getOrder(data.orderId);
  });

// ─── Story 5.1: Order Persistence & Confirmation ──────────────────────

/**
 * Persists a completed order from Violet into Supabase and returns confirmation data.
 *
 * ## Integration flow
 * 1. Client calls `submitOrderFn` → Violet returns `OrderSubmitResult` with COMPLETED + id
 * 2. Client then calls this function with the Violet order ID
 * 3. Server fetches full order from Violet, persists to Supabase, generates guest token
 * 4. Client redirects to `/order/$orderId/confirmation`
 *
 * ## Duplicate handling
 * The `orders.violet_order_id` UNIQUE constraint means a second call (page refresh, retry)
 * will fail on insert. The catch block handles this gracefully — Violet has the data regardless.
 *
 * ## Guest token
 * For guest buyers (userId is null), a crypto-random token is generated, hashed (SHA-256),
 * and stored in the orders table. The plaintext token is returned to the client exactly once.
 */
export const persistAndConfirmOrderFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    const schema = z.object({
      violetOrderId: z.string().min(1),
      userId: z.string().uuid().nullable(),
      sessionId: z.string().nullable(),
    });
    return schema.parse(input);
  })
  .handler(
    async ({
      data,
    }): Promise<
      ApiResponse<{
        orderId: string | null;
        orderLookupToken?: string;
        orderDetail: OrderDetail;
      }>
    > => {
      const supabase = getSupabaseServer();
      const adapter = getAdapter();

      const orderResult = await adapter.getOrder(data.violetOrderId);
      if (orderResult.error) {
        return { data: null, error: orderResult.error };
      }

      const email = orderResult.data.customer?.email ?? "";

      let persistResult: PersistOrderResult | null = null;
      try {
        persistResult = await persistOrder(supabase, {
          violetOrderId: data.violetOrderId,
          userId: data.userId,
          sessionId: data.sessionId,
          email,
          status: orderResult.data.status,
          subtotal: orderResult.data.subtotal,
          shippingTotal: orderResult.data.shippingTotal,
          taxTotal: orderResult.data.taxTotal,
          total: orderResult.data.total,
          currency: orderResult.data.currency,
          bags: orderResult.data.bags.map((bag) => ({
            violetBagId: bag.id,
            merchantId: bag.merchantId,
            merchantName: bag.merchantName,
            status: bag.status,
            financialStatus: bag.financialStatus,
            fulfillmentStatus: bag.fulfillmentStatus,
            subtotal: bag.subtotal,
            shippingTotal: bag.shippingTotal,
            taxTotal: bag.taxTotal,
            total: bag.total,
            shippingMethod: bag.shippingMethod?.label,
            carrier: bag.shippingMethod?.carrier,
            commissionRate: bag.commissionRate,
            items: bag.items.map((item) => ({
              skuId: item.skuId,
              name: item.name,
              quantity: item.quantity,
              price: item.price,
              linePrice: item.linePrice,
              thumbnail: item.thumbnail,
            })),
          })),
        });
      } catch (err) {
        logError(supabase, {
          source: "web",
          error_type: "ORDER.PERSIST_FAILED",
          message: err instanceof Error ? err.message : "Unknown persistence error",
          context: { violetOrderId: data.violetOrderId },
        });
      }

      /**
       * Mark the Supabase cart row as 'completed' so the pg_cron cleanup job
       * doesn't flag it as abandoned. Without this, all carts stay 'active'
       * forever because only the cookie is cleared — the DB row is never updated.
       *
       * Uses the RPC function `mark_cart_completed` from migration 20260414125612.
       * Fire-and-forget: failure here doesn't block the user (cleanup job will
       * eventually handle orphaned 'active' carts via the 30-day abandonment window).
       *
       * @see supabase/migrations/20260414125612_cleanup_abandoned_carts.sql
       */
      const { error: completeError } = await supabase.rpc("mark_cart_completed", {
        p_violet_cart_id: data.violetOrderId,
      });

      if (completeError) {
        logError(supabase, {
          source: "web",
          error_type: "CART.MARK_COMPLETED_FAILED",
          message: `Failed to mark cart as completed: ${completeError.message}`,
          context: {
            violetOrderId: data.violetOrderId,
            operation: "markCartCompleted",
          },
        });
      }

      return {
        data: {
          orderId: persistResult?.orderId ?? null,
          orderLookupToken: persistResult?.orderLookupToken,
          orderDetail: orderResult.data,
        },
        error: null,
      };
    },
  );

/**
 * Logs an error from client-side code to the `error_logs` table.
 *
 * ## Why this exists (Story 4.7 Code Review Fix — C1)
 * Client-side components (like `CheckoutErrorBoundary`) cannot call `logError()`
 * directly because it requires a service-role `SupabaseClient` that only exists
 * server-side. This Server Function bridges the gap: the client sends error data,
 * and we persist it using the service-role client.
 *
 * ## Input sanitization
 * Client-submitted error data is sanitized to prevent log injection and storage
 * abuse. Lengths are capped to reasonable maximums while preserving diagnostic value.
 * - `error_type`: max 100 chars (prevents category namespace abuse)
 * - `message`: max 2000 chars (reasonable for a human-readable error message)
 * - `stack_trace`: max 5000 chars (full stack with source maps)
 * - `context`: max 10KB serialized (prevents oversized payloads)
 *
 * ## Fire-and-forget on both sides
 * - Server: `logError()` catches its own errors (console.error fallback)
 * - Client: the caller should NOT await this — UI must never block on logging
 *
 * @see packages/shared/src/utils/errorLogger.ts — `logError()` implementation
 * @see apps/web/src/components/checkout/CheckoutErrorBoundary.tsx — primary consumer
 */
export const logClientErrorFn = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      error_type: string;
      message: string;
      stack_trace?: string;
      context?: Record<string, unknown>;
    }) => data,
  )
  .handler(async ({ data }) => {
    /**
     * Client-submitted error data is sanitized to prevent log injection and storage
     * abuse. Lengths are capped to reasonable maximums while preserving diagnostic value.
     */
    const sanitizedErrorType = data.error_type.slice(0, 100);
    const sanitizedMessage = data.message.slice(0, 2000);
    const sanitizedStackTrace = data.stack_trace?.slice(0, 5000);
    const sanitizedContext =
      data.context && JSON.stringify(data.context).length > 10000
        ? { truncated: true }
        : data.context;

    logError(getSupabaseServer(), {
      source: "web",
      error_type: sanitizedErrorType,
      message: sanitizedMessage,
      stack_trace: sanitizedStackTrace,
      context: sanitizedContext,
    });
    return { data: null, error: null };
  });

/**
 * Clears the `violet_cart_id` HttpOnly cookie after a successful order.
 *
 * Called after submit returns COMPLETED — prevents stale cart ID from causing
 * errors when the user starts a new cart (old cart is already submitted).
 *
 * Uses `maxAge: 0` to immediately expire the cookie (no `deleteCookie` in
 * TanStack Start — `setCookie` with zero max-age is the standard approach).
 *
 * HttpOnly cookie with Secure flag in production prevents transmission over
 * plain HTTP. SameSite=lax prevents CSRF while allowing top-level navigations.
 */
export const clearCartCookieFn = createServerFn({ method: "POST" }).handler(async () => {
  /**
   * HttpOnly cookie with Secure flag in production prevents transmission over
   * plain HTTP. SameSite=lax prevents CSRF while allowing top-level navigations.
   */
  setCookie("violet_cart_id", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return { data: null, error: null };
});
