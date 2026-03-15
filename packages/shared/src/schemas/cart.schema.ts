/**
 * Zod validation schemas for Violet cart API responses.
 *
 * Violet returns HTTP 200 even when items have errors — ALWAYS check
 * the `errors` array even on successful responses.
 *
 * @see https://docs.violet.io/api-reference/checkout/cart
 */

import { z } from "zod";

/** Validates a Violet bag error entry. */
export const violetBagErrorSchema = z.object({
  code: z.string().optional().default("UNKNOWN"),
  message: z.string().default(""),
  sku_id: z.number().optional(),
});

/** Validates a SKU line item within a Violet bag. */
export const violetCartSkuSchema = z.object({
  id: z.number(),
  sku_id: z.number(),
  quantity: z.number().int().min(1),
  price: z.number().default(0),
});

/** Validates a Violet bag (merchant group). */
export const violetBagSchema = z.object({
  id: z.number(),
  merchant_id: z.number(),
  merchant_name: z.string().optional().default(""),
  skus: z.array(violetCartSkuSchema).optional().default([]),
  subtotal: z.number().default(0),
  tax: z.number().default(0),
  shipping_total: z.number().default(0),
  errors: z.array(violetBagErrorSchema).optional().default([]),
});

/**
 * Validates a full Violet cart response.
 *
 * ## Story 4.4 additions
 * - `total`: cart grand total in cents — used for PaymentIntent amount display
 * - `payment_intent_client_secret`: Stripe PI secret — only present when the cart
 *   was created with `wallet_based_checkout: true`. Required for Stripe PaymentElement.
 * - `stripe_key`: Stripe publishable key returned by Violet (same as our env var).
 *   Informational only — we use `VITE_STRIPE_PUBLISHABLE_KEY` instead.
 *
 * @see https://docs.violet.io/guides/checkout/payments — wallet-based checkout
 */
export const violetCartResponseSchema = z.object({
  id: z.number(),
  channel_id: z.number().optional(),
  currency: z.string().optional().default("USD"),
  /** Cart grand total in integer cents (sum of all bags: subtotal + tax + shipping). */
  total: z.number().optional(),
  /**
   * Stripe PaymentIntent client secret — only present when cart was created
   * with `wallet_based_checkout: true`. Pass to `<Elements options={{ clientSecret }}>`.
   *
   * @see https://docs.violet.io/guides/checkout/payments
   */
  payment_intent_client_secret: z.string().optional(),
  /**
   * Stripe publishable key from Violet (same as our VITE_STRIPE_PUBLISHABLE_KEY).
   * We don't use this — prefer the env var to avoid exposing it via API responses.
   */
  stripe_key: z.string().optional(),
  bags: z.array(violetBagSchema).optional().default([]),
  /** CRITICAL: check this array even on HTTP 200 */
  errors: z.array(violetBagErrorSchema).optional().default([]),
});

export type VioletCartResponse = z.infer<typeof violetCartResponseSchema>;
export type VioletBagResponse = z.infer<typeof violetBagSchema>;
export type VioletCartSkuResponse = z.infer<typeof violetCartSkuSchema>;

// ─── Shipping schemas (Story 4.3) ─────────────────────────────────────────

/**
 * Validates a single shipping method from Violet's GET /shipping/available response.
 *
 * ## Field resilience strategy
 *
 * Violet may use either `label` or `name` for the display name — both are optional
 * here and the adapter picks whichever is present (`label ?? name ?? ""`).
 * The `id` field accepts both string and number (Violet's API returns integers but
 * we normalize to string for our internal ID convention).
 * The `price` field defaults to 0 for "FREE" shipping methods.
 *
 * ## ⚠️ Sandbox verification required
 * Field names `min_days`/`max_days` and the presence of `carrier` should be verified
 * against the actual Violet sandbox response before production release.
 *
 * @see https://docs.violet.io/api-reference/checkout/cart/get-available-shipping-methods
 */
export const violetShippingMethodSchema = z.object({
  /**
   * Shipping method identifier (confirmed field name: "shipping_method_id").
   *
   * ## Official Violet API response (from docs.violet.io/prism/checkout-guides)
   * The field is `shipping_method_id` (string), not `id`. This is the value
   * to pass back in the POST /checkout/cart/{id}/shipping body.
   *
   * @see https://docs.violet.io/prism/checkout-guides/carts-and-bags/shipping-methods
   */
  shipping_method_id: z.string(),
  /**
   * Human-readable shipping option name (e.g., "US Domestic", "International Shipping").
   * Confirmed field name: `label`. No `name` fallback needed — Violet always returns `label`.
   */
  label: z.string(),
  /**
   * Carrier name (e.g., "USPS", "OTHER"). Always present in Violet's response.
   * "OTHER" is used for merchant-specific or non-standard carriers.
   */
  carrier: z.string().optional(),
  /**
   * Shipping cost in integer cents. 0 means free shipping.
   * Confirmed field name: `price`.
   */
  price: z.number().default(0),
  /**
   * Bag ID repeated at method level (Violet convenience field).
   * Not needed for selection but present in the response.
   */
  bag_id: z.number().optional(),
  /**
   * Delivery time fields DO NOT EXIST in Violet's API.
   * Confirmed via official FAQ: "Not at this time. The platforms don't consistently
   * provide shipping time data through their APIs."
   * These fields are kept as optional to avoid schema failures if Violet adds them later.
   *
   * @see https://docs.violet.io/faqs/checkout/shipping
   */
  min_days: z.number().optional(),
  max_days: z.number().optional(),
});

/**
 * Validates one bag entry from the GET /shipping/available response.
 *
 * Each bag has its own list of shipping methods because merchants may use
 * different carriers. The caller must select one method per bag.
 */
export const violetShippingAvailableItemSchema = z.object({
  /** Violet bag integer ID */
  bag_id: z.number(),
  /** Available methods — default to empty array if absent (carrier API failure) */
  shipping_methods: z.array(violetShippingMethodSchema).optional().default([]),
});

/**
 * Validates the full response from GET /checkout/cart/{id}/shipping/available.
 *
 * Returns an array — one entry per merchant bag in the cart.
 * This call is intentionally slow (2–5s) as it calls third-party carrier APIs.
 *
 * @see https://docs.violet.io/api-reference/checkout/cart/get-available-shipping-methods
 */
export const violetShippingAvailableResponseSchema = z.array(violetShippingAvailableItemSchema);

/**
 * Validates the shipping address body sent to Violet.
 *
 * ## Confirmed Violet OrderAddress fields (from official docs)
 * `address_1`, `city`, `state`, `postal_code`, `country`, `phone`.
 *
 * `name` and `email` are NOT part of the shipping address — they belong to the
 * Customer object (POST /checkout/cart/{id}/customer, Story 4.4).
 *
 * All fields are optional in the Zod schema (Violet validates server-side),
 * but the UI enforces address_1, city, state, postal_code, and country as required.
 *
 * @see https://docs.violet.io/api-reference/order-service/checkout-shipping/set-shipping-address
 */
export const violetShippingAddressSchema = z.object({
  /** Street address line 1 */
  address_1: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  /** Postal/ZIP code */
  postal_code: z.string().optional(),
  /** ISO 3166-1 alpha-2 country code (e.g., "US", "GB") */
  country: z.string().optional(),
  /** Contact phone for carrier delivery — optional */
  phone: z.string().optional(),
});

export type VioletShippingMethod = z.infer<typeof violetShippingMethodSchema>;
export type VioletShippingAvailableResponse = z.infer<typeof violetShippingAvailableResponseSchema>;
