/**
 * Mobile fetch functions for checkout operations via the web backend API.
 *
 * All checkout mutations go through the web backend API Routes which call
 * the Violet API server-side. The Violet token NEVER reaches this client.
 *
 * ## Violet Checkout Flow (per docs)
 * 1. Set shipping address   → POST /api/cart/:cartId/shipping_address
 * 2. Get shipping methods   → GET  /api/cart/:cartId/shipping/available
 * 3. Set shipping methods   → POST /api/cart/:cartId/shipping
 * 4. Set customer info      → POST /api/cart/:cartId/customer
 * 5. Set billing address    → POST /api/cart/:cartId/billing_address (if different)
 * 6. Get payment intent     → GET  /api/cart/:cartId/payment-intent
 * 7. Submit order           → POST /api/cart/:cartId/submit
 *
 * @see https://docs.violet.io/prism/checkout-guides/carts-and-bags/carts/lifecycle-of-a-cart
 * @see https://docs.violet.io/prism/checkout-guides/guides/violet-checkout-with-stripejs-v3
 * @see audit-dry-kiss-duplications.md — Phase 4 migration
 */
import type { Cart, ShippingMethodsAvailable } from "@ecommerce/shared";
import { apiDelete, apiGet, apiPost } from "./apiClient";

// ─── Response types ─────────────────────────────────────────────────────────

/** Generic API response with optional error. */
interface CheckoutApiResponse<T = unknown> {
  data?: T;
  error?: { message?: string; code?: string };
}

/** Payment intent response from Violet via web backend. */
export interface PaymentIntentResponse {
  clientSecret?: string;
  stripePublishableKey?: string;
}

/** Order submission response from Violet via web backend. */
export interface SubmitOrderResponse {
  status?: string;
  id?: string;
}

// ─── Fetch functions ────────────────────────────────────────────────────────

/**
 * Step 1: Set the shipping address on the cart.
 *
 * After this, Violet can compute available shipping methods based on the
 * destination, SKU dimensions, weight, and merchant shipping providers.
 *
 * Per Violet docs, postal code is required for most countries but exempt
 * for ~60 countries. Phone is optional — used for carrier notifications.
 *
 * @see https://docs.violet.io/prism/checkout-guides/carts-and-bags/customers
 */
export async function setShippingAddress(
  cartId: string,
  address: {
    address_1: string;
    city: string;
    state: string;
    postal_code: string;
    country: string;
    phone?: string;
  },
): Promise<CheckoutApiResponse> {
  return apiPost<CheckoutApiResponse>(`/api/cart/${cartId}/shipping_address`, address);
}

/**
 * Step 2: Get available shipping methods per bag (merchant).
 *
 * Returns an array where each entry corresponds to a bag in the cart.
 * Each bag entry contains the shipping methods available for that merchant
 * given the shipping address already set.
 *
 * @see https://docs.violet.io/prism/checkout-guides/carts-and-bags/shipping-methods
 */
export async function getAvailableShippingMethods(
  cartId: string,
): Promise<CheckoutApiResponse<ShippingMethodsAvailable[]>> {
  return apiGet<CheckoutApiResponse<ShippingMethodsAvailable[]>>(
    `/api/cart/${cartId}/shipping/available`,
  );
}

/**
 * Step 3: Apply selected shipping methods to each bag.
 *
 * Each bag requires its own shipping method. The body is an array of
 * `{ bag_id, shipping_method_id }` objects — one per bag.
 *
 * @see https://docs.violet.io/prism/checkout-guides/carts-and-bags/shipping-methods
 */
export async function setShippingMethods(
  cartId: string,
  selections: Array<{ bag_id: number; shipping_method_id: string }>,
): Promise<CheckoutApiResponse> {
  return apiPost<CheckoutApiResponse>(`/api/cart/${cartId}/shipping`, selections);
}

/**
 * Step 4: Set customer info (guest checkout).
 *
 * Email, first name, last name are required. Marketing consent is optional —
 * when enabled, `communication_preferences: [{ enabled: true }]` is sent.
 *
 * @see https://docs.violet.io/prism/checkout-guides/guides/marketing-consent
 */
export async function setCustomerInfo(
  cartId: string,
  customer: {
    email: string;
    first_name: string;
    last_name: string;
    communication_preferences?: Array<{ enabled: boolean }>;
  },
): Promise<CheckoutApiResponse> {
  return apiPost<CheckoutApiResponse>(`/api/cart/${cartId}/customer`, customer);
}

/**
 * Step 5: Set billing address (only if different from shipping).
 *
 * If billing address is the same as shipping, this step is skipped.
 */
export async function setBillingAddress(
  cartId: string,
  address: {
    address_1: string;
    city: string;
    state: string;
    postal_code: string;
    country: string;
  },
): Promise<CheckoutApiResponse> {
  return apiPost<CheckoutApiResponse>(`/api/cart/${cartId}/billing_address`, address);
}

/**
 * Step 6: Get Stripe payment intent client secret.
 *
 * Returns the client secret needed to initialize Stripe PaymentSheet
 * and the Violet Stripe publishable key (may differ from our env key
 * in demo/test mode).
 *
 * The payment intent amount is automatically kept in sync by Violet
 * as cart contents change — no manual update needed.
 *
 * @see https://docs.violet.io/prism/checkout-guides/guides/violet-checkout-with-stripejs-v3
 */
export async function getPaymentIntent(
  cartId: string,
): Promise<CheckoutApiResponse<PaymentIntentResponse>> {
  return apiGet<CheckoutApiResponse<PaymentIntentResponse>>(`/api/cart/${cartId}/payment-intent`);
}

/**
 * Step 7: Submit the cart to Violet, converting it into an Order.
 *
 * Uses `app_order_id` (UUID v4) for idempotency — retries with the same
 * ID won't create duplicate orders.
 *
 * After submission, the cart becomes an Order with states:
 * - COMPLETED: Success
 * - REQUIRES_ACTION: 3D Secure challenge needed
 * - REJECTED: Order rejected
 * - CANCELED: Order canceled by merchant
 *
 * @see https://docs.violet.io/prism/checkout-guides/carts-and-bags/carts/lifecycle-of-a-cart
 */
/**
 * Apply a discount/promo code to the cart.
 *
 * Per Violet docs:
 * - `code` is the promo code entered by the shopper
 * - `merchant_id` must match a merchant with SKUs in the cart
 * - `email` is optional, used for customer-restricted discounts
 * - Returns the full cart with discounts applied to correct bags
 * - 6 statuses: PENDING, APPLIED, INVALID, NOT_SUPPORTED, ERROR, EXPIRED
 * - Non-blocking: invalid discounts are auto-removed at submission
 *
 * @see https://docs.violet.io/prism/checkout-guides/discounts
 * @see https://docs.violet.io/prism/checkout-guides/discounts/applying-discounts
 */
export async function addDiscount(
  cartId: string,
  discount: { code: string; merchant_id: number; email?: string },
): Promise<CheckoutApiResponse<Cart>> {
  // Sends Violet-format body {code, merchant_id, email?} directly.
  // The API Route validates with Zod and converts to DiscountInput internally.
  // @see https://docs.violet.io/prism/checkout-guides/discounts/applying-discounts
  return apiPost<CheckoutApiResponse<Cart>>(`/api/cart/${cartId}/discounts`, discount);
}

/**
 * Remove a discount/promo code from the cart.
 *
 * Returns the full cart without the removed discount.
 *
 * @see https://docs.violet.io/prism/checkout-guides/discounts/applying-discounts
 */
export async function removeDiscount(
  cartId: string,
  discountId: string,
): Promise<CheckoutApiResponse<Cart>> {
  return apiDelete<CheckoutApiResponse<Cart>>(`/api/cart/${cartId}/discounts/${discountId}`);
}

/**
 * Step 7: Submit the cart to Violet, converting it into an Order.
 *
 * Uses `app_order_id` (UUID v4) for idempotency — retries with the same
 * ID won't create duplicate orders.
 *
 * After submission, the cart becomes an Order with states:
 * - COMPLETED: Success
 * - REQUIRES_ACTION: 3D Secure challenge needed
 * - REJECTED: Order rejected
 * - CANCELED: Order canceled by merchant
 *
 * @see https://docs.violet.io/prism/checkout-guides/carts-and-bags/carts/lifecycle-of-a-cart
 */
export async function submitOrder(
  cartId: string,
  appOrderId: string,
): Promise<CheckoutApiResponse<SubmitOrderResponse>> {
  return apiPost<CheckoutApiResponse<SubmitOrderResponse>>(`/api/cart/${cartId}/submit`, {
    app_order_id: appOrderId,
  });
}
