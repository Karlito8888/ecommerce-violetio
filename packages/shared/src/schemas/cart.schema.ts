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

/** Validates a full Violet cart response. */
export const violetCartResponseSchema = z.object({
  id: z.number(),
  channel_id: z.number().optional(),
  currency: z.string().optional().default("USD"),
  bags: z.array(violetBagSchema).optional().default([]),
  /** CRITICAL: check this array even on HTTP 200 */
  errors: z.array(violetBagErrorSchema).optional().default([]),
});

export type VioletCartResponse = z.infer<typeof violetCartResponseSchema>;
export type VioletBagResponse = z.infer<typeof violetBagSchema>;
export type VioletCartSkuResponse = z.infer<typeof violetCartSkuSchema>;
