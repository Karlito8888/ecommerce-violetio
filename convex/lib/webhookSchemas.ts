// convex/lib/webhookSchemas.ts
//
// Zod validation schemas for Violet webhook payloads.
// Adapted from supabase/functions/_shared/schemas.ts (Deno) for Convex runtime (Node).
//
// These schemas validate inbound Violet webhook payloads in the handle-webhook
// Convex HTTP Action. They ensure type safety before data reaches processors.
//
// Doc: https://docs.convex.dev/functions/validation — Convex validation best practices
// Doc: https://docs.violet.io/prism/webhooks/events — Violet event reference
//
// ⚠️ SYNC: This file is the Convex-native copy of webhook validation schemas.
// The canonical source is packages/shared/src/schemas/webhook.schema.ts (more comprehensive).
// The Convex schemas are intentionally simpler (fewer fields, more permissive) for
// webhook ingestion performance. If you modify schemas here, update the canonical copy too.
//
// Files in sync:
//   - convex/lib/webhookSchemas.ts          ← YOU ARE HERE (Convex, permissive)
//   - packages/shared/src/schemas/webhook.schema.ts (canonical, comprehensive)
//   - packages/shared/src/types/order.types.ts (TypeScript type definitions)

import { z } from "zod";

// ─── ORDER/Bag Schemas ──────────────────────────────────────────────────────

/**
 * Validates Violet ORDER_* webhook payload.
 * @see https://docs.violet.io/prism/webhooks/events/order-webhooks
 */
export const violetOrderPayloadSchema = z.object({
  id: z.number(),
  status: z.string(),
  app_order_id: z.string().optional(),
  customer_id: z.number().optional(),
  date_last_modified: z.string().optional(),
});

export type VioletOrderPayload = z.infer<typeof violetOrderPayloadSchema>;

/**
 * Validates Violet BAG_* webhook payload.
 * @see https://docs.violet.io/prism/webhooks/events/order-webhooks
 */
export const violetBagPayloadSchema = z.object({
  id: z.number(),
  order_id: z.number(),
  status: z.string(),
  financial_status: z.string().optional(),
  fulfillment_status: z.string().optional(),
  merchant_id: z.number(),
  merchant_name: z.string().optional(),
  tracking_number: z.string().optional(),
  tracking_url: z.string().optional(),
  carrier: z.string().optional(),
  date_last_modified: z.string().optional(),
});

export type VioletBagPayload = z.infer<typeof violetBagPayloadSchema>;

// ─── MERCHANT Schemas ───────────────────────────────────────────────────────

/**
 * Validates Violet MERCHANT_* webhook payload.
 * @see https://docs.violet.io/prism/webhooks/events/merchant-webhooks
 */
export const violetMerchantPayloadSchema = z.object({
  id: z.number(),
  name: z.string().optional(),
  status: z.string().optional(),
  connection_status: z.string().optional(),
  source: z.string().optional(),
  date_last_modified: z.string().optional(),
});

export type VioletMerchantPayload = z.infer<typeof violetMerchantPayloadSchema>;

// ─── TRANSFER Schemas ───────────────────────────────────────────────────────

/**
 * Validates Violet TRANSFER_* webhook payload.
 * @see https://docs.violet.io/prism/payments/payments-during-checkout/guides/handling-failed-transfers
 */
export const violetTransferPayloadSchema = z.object({
  id: z.number(),
  merchant_id: z.number(),
  amount: z.number().optional(),
  currency: z.string().optional(),
  status: z.string().optional(),
  payment_provider_transfer_id: z.string().optional().nullable(),
  related_bags: z.array(z.string()).optional(),
  related_orders: z.array(z.string()).optional(),
  related_distributions: z.array(z.string()).optional(),
  errors: z
    .array(
      z.object({
        payout_transfer_id: z.number().optional(),
        error_code: z.number().optional(),
        error_message: z.string().optional(),
        code: z.string().optional(),
        message: z.string().optional(),
        date_created: z.string().optional(),
      }),
    )
    .optional(),
  date_created: z.string().optional(),
  date_last_modified: z.string().optional(),
});

export type VioletTransferPayload = z.infer<typeof violetTransferPayloadSchema>;

// ─── PAYOUT ACCOUNT Schemas ─────────────────────────────────────────────────

/**
 * Validates Violet MERCHANT_PAYOUT_ACCOUNT_* webhook payload.
 * @see https://docs.violet.io/prism/payments/payouts/prism-payout-accounts
 */
export const violetPayoutAccountPayloadSchema = z.object({
  id: z.number(),
  account_type: z.string().optional(),
  account_id: z.number().optional(),
  app_id: z.number().optional(),
  merchant_id: z.number().optional(),
  is_active: z.boolean().optional(),
  country_code: z.string().optional(),
  payment_provider: z.string().optional(),
  payment_provider_account_id: z.string().optional().nullable(),
  payment_provider_account: z
    .object({
      account_id: z.string().optional(),
      account_type: z.string().optional(),
      email: z.string().optional(),
      banking_country: z.string().optional(),
      banking_currency: z.string().optional(),
      charges_enabled: z.boolean().optional(),
      payouts_enabled: z.boolean().optional(),
      requirements: z
        .object({
          alternatives: z.array(z.string()).optional(),
          currently_due: z.array(z.string()).optional(),
          errors: z.array(z.string()).optional(),
          eventually_due: z.array(z.string()).optional(),
          past_due: z.array(z.string()).optional(),
          pending_verification: z.array(z.string()).optional(),
        })
        .optional(),
      date_created: z.string().optional(),
      date_last_modified: z.string().optional(),
    })
    .nullable()
    .optional(),
  errors: z.array(z.string()).optional(),
  date_created: z.string().optional(),
  date_last_modified: z.string().optional(),
});

export type VioletPayoutAccountPayload = z.infer<typeof violetPayoutAccountPayloadSchema>;

// ─── SYNC & OFFER Schemas (audit trail) ─────────────────────────────────────

export const violetOfferPayloadSchema = z.object({
  id: z.number(),
  name: z.string().optional(),
  merchant_id: z.number().optional(),
});

export const violetSyncPayloadSchema = z.object({
  id: z.number(),
  merchant_id: z.number(),
  status: z.string().optional(),
  total_products: z.number().optional(),
  total_products_synced: z.number().optional(),
});

export const violetCollectionPayloadSchema = z.object({
  id: z.number(),
  name: z.string().optional(),
  merchant_id: z.number().optional(),
});

export const violetPaymentTransactionPayloadSchema = z.object({
  id: z.number(),
  order_id: z.number().optional(),
  bag_id: z.number().optional(),
  merchant_id: z.number().optional(),
  capture_status: z.string().optional(),
  amount: z.number().optional(),
  currency: z.string().optional(),
  payment_provider: z.string().optional(),
  payment_provider_transaction_id: z.string().optional().nullable(),
});
