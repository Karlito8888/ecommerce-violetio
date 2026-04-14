/**
 * Zod validation schemas for Violet cart API responses and client input validation.
 *
 * ## Monetary field validation strategy
 * All monetary fields are validated as non-negative integers representing cents.
 * Violet API returns prices in cents to avoid floating-point precision issues
 * (e.g., 4999 = $49.99). The `.nonnegative()` constraint ensures no negative
 * values slip through from malformed API responses or client submissions.
 *
 * ## Response vs Input schemas
 * - `violet*Schema` — validate/transform Violet API responses (snake_case, lenient defaults)
 * - `*InputSchema` — validate client-submitted data (camelCase, strict constraints)
 *
 * Violet returns HTTP 200 even when items have errors — ALWAYS check
 * the `errors` array even on successful responses.
 *
 * @see https://docs.violet.io/api-reference/checkout/cart
 */

import { z } from "zod";
import { COUNTRIES_WITHOUT_POSTAL_CODE } from "../adapters/violetConstants.js";

/**
 * Validates a Violet bag error entry.
 *
 * ## Violet documented error structure
 * - `type`: error category (EXTERNAL_SUBMISSION_FAILED, INTERNAL_ADD_ITEM, etc.)
 * - `bag_id`: bag this error belongs to
 * - `entity_type`: "order_sku" or "bag" — distinguishes item-level vs bag-level errors
 * - `message`: human-readable description
 * - `external_platform`: originating platform (SHOPIFY, BIGCOMMERCE, etc.)
 * - `sku_id`: SKU this error refers to (when entity_type = "order_sku")
 *
 * We also accept `code` (used in some Violet responses) for backwards compatibility.
 *
 * @see https://docs.violet.io/prism/checkout-guides/carts-and-bags/carts/lifecycle-of-a-cart
 */
export const violetBagErrorSchema = z.object({
  type: z.string().optional(),
  code: z.string().optional(),
  message: z.string().default(""),
  bag_id: z.number().optional(),
  entity_type: z.enum(["order_sku", "bag"]).optional(),
  external_platform: z.string().optional(),
  sku_id: z.number().optional(),
});

/**
 * Validates a discount entry within a Violet bag response.
 *
 * After pricing, `value_type` and `amount_total` are populated.
 * Before pricing, only `id`, `bag_id`, `status`, `type`, and `code` are present.
 *
 * @see https://docs.violet.io/prism/checkout-guides/discounts/applying-discounts
 */
export const violetDiscountSchema = z.object({
  id: z.number(),
  bag_id: z.number(),
  status: z
    .enum(["PENDING", "APPLIED", "INVALID", "NOT_SUPPORTED", "ERROR", "EXPIRED"])
    .optional()
    .default("PENDING"),
  type: z.string().optional().default("CODE"),
  code: z.string(),
  value_type: z.string().optional(),
  amount_total: z.number().nonnegative().optional(),
  date_created: z.string().optional(),
  date_last_modified: z.string().optional(),
});

/**
 * Validates a SKU line item within a Violet bag (OrderSku in cart response).
 *
 * ## product_type field
 * Violet includes `product_type` on each cart SKU (e.g., "PHYSICAL", "DIGITAL").
 * This is used to determine if shipping method selection can be skipped during checkout.
 * When all SKUs in a bag are DIGITAL, no shipping method is required.
 *
 * @see https://docs.violet.io/prism/catalog/skus — Product Types
 * @see https://docs.violet.io/prism/checkout-guides/carts-and-bags/carts/add-items-to-cart — Cart SKU response
 */
export const violetCartSkuSchema = z.object({
  id: z.number(),
  sku_id: z.number(),
  quantity: z.number().int().min(1),
  price: z.number().nonnegative().default(0),
  /** Product type from Violet cart response. Used to skip shipping for DIGITAL products. */
  product_type: z.enum(["PHYSICAL", "DIGITAL", "VIRTUAL", "BUNDLED"]).optional(),
});

/** Validates a Violet bag (merchant group). */
export const violetBagSchema = z.object({
  id: z.number(),
  merchant_id: z.number(),
  merchant_name: z.string().optional().default(""),
  skus: z.array(violetCartSkuSchema).optional().default([]),
  subtotal: z.number().nonnegative().default(0),
  tax: z.number().nonnegative().default(0),
  shipping_total: z.number().nonnegative().default(0),
  /** Sum of all APPLIED discounts in integer cents — populated after pricing */
  discount_total: z.number().nonnegative().default(0),
  errors: z.array(violetBagErrorSchema).optional().default([]),
  /** Discount codes applied to this bag */
  discounts: z.array(violetDiscountSchema).optional().default([]),
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
  total: z.number().nonnegative().optional(),
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
  price: z.number().nonnegative().default(0),
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

// ─── Client Input Validation Schemas ──────────────────────────────────────

/**
 * Validates client-submitted cart item data (add-to-cart action).
 *
 * Unlike Violet response schemas which are lenient with defaults,
 * input schemas enforce strict constraints to catch bad data before
 * it reaches the API.
 */
export const cartItemInputSchema = z.object({
  /** Violet SKU ID — must be a non-empty string */
  skuId: z.string().min(1, "SKU ID is required"),
  /** Item quantity — integer between 1 and 99 */
  quantity: z
    .number()
    .int()
    .min(1, "Quantity must be at least 1")
    .max(99, "Quantity cannot exceed 99"),
});

/** Inferred type for validated cart item input (Zod-inferred). */
export type CartItemInputValidated = z.infer<typeof cartItemInputSchema>;

/**
 * Validates client-submitted guest customer data (checkout step).
 *
 * Applied before sending to Violet's POST /checkout/cart/{id}/customer endpoint.
 * Field length limits prevent abuse and match reasonable real-world constraints.
 */
export const customerInputSchema = z.object({
  /** Valid email address */
  email: z.string().email("Valid email is required"),
  /** Customer first name — 1 to 100 characters */
  firstName: z.string().min(1, "First name is required").max(100, "First name is too long"),
  /** Customer last name — 1 to 100 characters */
  lastName: z.string().min(1, "Last name is required").max(100, "Last name is too long"),
});

/** Inferred type for validated customer input. */
export type CustomerInputValidated = z.infer<typeof customerInputSchema>;

/**
 * Validates client-submitted shipping address (checkout step).
 *
 * All fields are required for input validation — unlike the Violet response schema
 * (`violetShippingAddressSchema`) which makes them optional because Violet validates
 * server-side. This schema catches missing fields before the API call, providing
 * faster feedback to the user.
 *
 * ## Postal code exemption
 * Some countries (AO, AG, AW, etc.) do not use postal codes. The schema uses a
 * `.refine()` to make `postalCode` optional when `country` is in the exempt list.
 * For all other countries, `postalCode` is required (1–20 chars).
 *
 * @see https://docs.violet.io/prism/checkout-guides/carts-and-bags/customers — Postal Code Requirements
 */
export const shippingAddressInputSchema = z
  .object({
    /** Street address line 1 — 1 to 200 characters */
    address1: z.string().min(1, "Address is required").max(200, "Address is too long"),
    /** City — 1 to 100 characters */
    city: z.string().min(1, "City is required").max(100, "City is too long"),
    /** State/province — 1 to 50 characters */
    state: z.string().min(1, "State is required").max(50, "State is too long"),
    /** Postal/ZIP code — required for most countries, exempt for ~60 countries */
    postalCode: z.string().max(20, "Postal code is too long"),
    /** ISO 3166-1 alpha-2 country code (exactly 2 characters, e.g., "US", "GB") */
    country: z.string().length(2, "Country must be a 2-letter ISO code"),
  })
  .refine(
    (data) => {
      // Postal code is optional for countries that don't use them
      if (COUNTRIES_WITHOUT_POSTAL_CODE.has(data.country)) return true;
      return data.postalCode.trim().length >= 1;
    },
    {
      message: "Postal code is required",
      path: ["postalCode"],
    },
  );

/** Inferred type for validated shipping address input. */
export type ShippingAddressInputValidated = z.infer<typeof shippingAddressInputSchema>;
