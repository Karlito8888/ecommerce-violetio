/**
 * Cart / Bag / CartSKU transformation functions and helpers.
 *
 * These functions transform Violet cart API responses into our internal
 * Cart/Bag/CartItem domain types. They have no side-effects and no API calls.
 *
 * Extracted from VioletAdapter for testability and reuse.
 */

import type { Cart, Bag, BagError, CartItem, DiscountItem } from "../types/index.js";
import { violetCartResponseSchema } from "../schemas/index.js";
import type { VioletBagResponse, VioletCartSkuResponse } from "../schemas/index.js";

/**
 * Parses a raw Violet cart API response and transforms it to our Cart type.
 *
 * Handles the 200-with-errors pattern: extracts `errors` array even on HTTP 200.
 * Returns a Cart with the `violetCartId` as the primary identifier — the caller
 * (Server Function) is responsible for creating/looking up the Supabase cart row.
 */
export function parseAndTransformCart(
  raw: unknown,
): { data: Cart; error: null } | { data: null; error: { code: string; message: string } } {
  const parsed = violetCartResponseSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      data: null,
      error: { code: "VIOLET.VALIDATION_ERROR", message: parsed.error.message },
    };
  }

  const violet = parsed.data;
  const bags = violet.bags.map((bag) => transformBag(bag));

  // Total = sum of (subtotal + tax + shippingTotal - discountTotal) per bag.
  const total = bags.reduce(
    (sum, b) => sum + b.subtotal + b.tax + b.shippingTotal - b.discountTotal,
    0,
  );

  // Build a partial Cart — id and userId are set by the Server Function
  // after persisting to Supabase. violetCartId is the Violet integer ID.
  return {
    data: {
      id: "", // Set by Server Function after Supabase upsert
      violetCartId: String(violet.id),
      userId: null,
      sessionId: null,
      bags,
      total,
      currency: violet.currency,
      status: "active",
      /**
       * Derived from bags: true when every bag is digital.
       * When true, the entire shipping flow is skipped during checkout.
       *
       * @see https://docs.violet.io/prism/catalog/skus — Digital Product Delivery
       */
      allBagsDigital: bags.length > 0 && bags.every((b) => b.isDigital),
      /**
       * Maps Violet's `payment_intent_client_secret` (snake_case) to our
       * internal `paymentIntentClientSecret` (camelCase). Only present when
       * cart was created with `wallet_based_checkout: true`.
       */
      paymentIntentClientSecret: violet.payment_intent_client_secret,
    },
    error: null,
  };
}

export function transformBag(raw: VioletBagResponse): Bag {
  const items = raw.skus.map((sku) => transformCartSku(sku));
  const errors: BagError[] = raw.errors.map((e) => ({
    code: e.type ?? e.code ?? "UNKNOWN",
    message: e.message,
    skuId: e.sku_id !== undefined ? String(e.sku_id) : undefined,
    type: e.type,
    entityType: e.entity_type,
    externalPlatform: e.external_platform,
  }));

  const discounts: DiscountItem[] = raw.discounts.map((d) => ({
    id: String(d.id),
    bagId: String(d.bag_id),
    status: d.status,
    type: d.type,
    code: d.code,
    valueType: d.value_type,
    amountTotal: d.amount_total,
    dateCreated: d.date_created,
  }));

  // Violet returns subtotal=0 before checkout steps (shipping, tax).
  // Compute from items when Violet hasn't calculated yet.
  const computedSubtotal = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const subtotal = raw.subtotal > 0 ? raw.subtotal : computedSubtotal;

  return {
    id: String(raw.id),
    merchantId: String(raw.merchant_id),
    merchantName: raw.merchant_name,
    items,
    subtotal,
    tax: raw.tax,
    shippingTotal: raw.shipping_total,
    discountTotal: raw.discount_total,
    errors,
    discounts,
    /**
     * A bag is digital when ALL its items are non-PHYSICAL.
     * Per Violet docs: "When all SKUs in a bag are digital, you should skip
     * the shipping method selection during checkout."
     * Empty bags default to false (conservative — require shipping).
     *
     * @see https://docs.violet.io/prism/catalog/skus — Digital Product Delivery
     */
    isDigital: items.length > 0 && items.every((item) => item.type !== "PHYSICAL"),
  };
}

export function transformCartSku(raw: VioletCartSkuResponse): CartItem {
  return {
    id: String(raw.id),
    skuId: String(raw.sku_id),
    productId: "", // Violet doesn't return product_id in cart SKU response
    quantity: raw.quantity,
    unitPrice: raw.price,
    type: raw.product_type ?? "PHYSICAL",
  };
}

/**
 * Returns the Violet App ID from environment.
 * Used as channel_id when creating carts.
 */
export function getAppId(): string | null {
  // The appId is available in process.env on the server
  return (typeof process !== "undefined" && process.env?.VIOLET_APP_ID) || null;
}
