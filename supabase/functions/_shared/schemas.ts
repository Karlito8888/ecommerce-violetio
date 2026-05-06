/**
 * Zod validation schemas for Supabase Edge Functions.
 *
 * ## ⚠️ SYNC WARNING — Manual Deno/Node duplication
 *
 * Edge Functions run in Deno and CANNOT import from the monorepo's `packages/shared/`
 * (Node/Bun workspace packages). Schemas here are **manual copies** of their canonical
 * sources in `packages/shared/src/schemas/`.
 *
 * **If you modify ANY schema here, update the canonical source too (and vice versa).**
 *
 * Canonical sources → Edge Function copies:
 * - `packages/shared/src/schemas/webhook.schema.ts` → webhook schemas below
 *
 * @see M2 code review fix — added sync documentation
 */

import { z } from "npm:zod";

// ─── Webhook Schemas (Story 3.7 + Story 5.2) ─────────────────────────
//
// These schemas validate inbound Violet webhook payloads in the handle-webhook
// Edge Function. They mirror the TypeScript types in packages/shared/src/types/order.types.ts
// and MUST be kept in sync (same Deno/Node constraint as the schemas above).
//
// Pipeline: Violet POST → HMAC verify → 2-phase header validation → idempotency
// check (webhook_events.event_id UNIQUE) → payload validation (these schemas)
// → processor routing → DB updates → 200 response.
//
// Violet retries up to 10 times over 24 hours with exponential backoff on non-2xx,
// and auto-disables webhooks after 50+ failures in 30 minutes.
// @see https://docs.violet.io/prism/webhooks/handling-webhooks

/**
 * All webhook event types our system handles.
 *
 * **Offer events** (Story 3.7): Catalog sync monitoring/audit trail.
 * **Sync events** (Story 3.7): Monitoring/audit trail only — no product-level action.
 * **Order events** (Story 5.2): Direct order status update from Violet.
 * **Bag events** (Story 5.2): Per-merchant bag status, tracking, refund processing.
 *
 * Violet also emits ORDER_ACCEPTED, ORDER_SHIPPED, ORDER_DELIVERED, ORDER_FAILED
 * which are NOT in this enum. Unknown types are accepted (200) via two-phase
 * header validation to prevent Violet from disabling the endpoint.
 *
 * ⚠️ SYNC WARNING: This schema is a manual copy of
 * `packages/shared/src/schemas/webhook.schema.ts` (Deno cannot import Node workspace
 * packages). Any change here MUST be mirrored there, and vice versa.
 *
 * @see https://docs.violet.io/prism/webhooks/events/order-webhooks — Violet event reference
 * @see packages/shared/src/schemas/webhook.schema.ts — Canonical source (Node side)
 */
export const webhookEventTypeSchema = z.enum([
  // ─── Offer events ───────────────────────────────────────────────
  "OFFER_CREATED", // Deprecated — aliased to OFFER_ADDED processor
  "OFFER_ADDED",
  "OFFER_UPDATED",
  "OFFER_REMOVED",
  "OFFER_DELETED",
  // ─── Product Sync events ────────────────────────────────────────
  "PRODUCT_SYNC_STARTED",
  "PRODUCT_SYNC_COMPLETED",
  "PRODUCT_SYNC_FAILED",
  // ─── Collection Sync events ─────────────────────────────────────
  "COLLECTION_SYNC_STARTED",
  "COLLECTION_SYNC_COMPLETED",
  "COLLECTION_SYNC_FAILED",
  // ─── Merchant events ─────────────────────────────────────────────
  "MERCHANT_CONNECTED",
  "MERCHANT_DISCONNECTED",
  "MERCHANT_ENABLED",
  "MERCHANT_DISABLED",
  "MERCHANT_COMPLETE",
  "MERCHANT_NEEDS_ATTENTION",
  // ─── Collection events ──────────────────────────────────────────
  "COLLECTION_CREATED",
  "COLLECTION_UPDATED",
  "COLLECTION_REMOVED",
  "COLLECTION_OFFERS_UPDATED",
  // ─── Order events ───────────────────────────────────────────────
  "ORDER_ACCEPTED",
  "ORDER_UPDATED",
  "ORDER_COMPLETED",
  "ORDER_CANCELED",
  "ORDER_CANCELLED", // UK spelling variant
  "ORDER_REFUNDED",
  "ORDER_RETURNED",
  "ORDER_SHIPPED",
  "ORDER_DELIVERED",
  "ORDER_FAILED",
  // ─── Bag events ────────────────────────────────────────────────
  "BAG_SUBMITTED",
  "BAG_ACCEPTED",
  "BAG_SHIPPED",
  "BAG_COMPLETED",
  "BAG_CANCELED",
  "BAG_REFUNDED",
  // ─── Transfer events ───────────────────────────────────────────
  "TRANSFER_SENT",
  "TRANSFER_PARTIALLY_SENT",
  "TRANSFER_FAILED",
  "TRANSFER_UPDATED",
  "TRANSFER_REVERSED",
  "TRANSFER_PARTIALLY_REVERSED",
  "TRANSFER_REVERSAL_FAILED",
  // ─── Payment Transaction events ─────────────────────────────────
  "PAYMENT_TRANSACTION_CAPTURE_STATUS_UPDATED",
  "PAYMENT_TRANSACTION_CAPTURE_STATUS_AUTHORIZED",
  "PAYMENT_TRANSACTION_CAPTURE_STATUS_CAPTURED",
  "PAYMENT_TRANSACTION_CAPTURE_STATUS_REFUNDED",
  "PAYMENT_TRANSACTION_CAPTURE_STATUS_PARTIALLY_REFUNDED",
  "PAYMENT_TRANSACTION_CAPTURE_STATUS_FAILED",
  // ─── Payout Account events ──────────────────────────────────────
  "MERCHANT_PAYOUT_ACCOUNT_CREATED",
  "MERCHANT_PAYOUT_ACCOUNT_REQUIREMENTS_UPDATED",
  "MERCHANT_PAYOUT_ACCOUNT_DELETED",
  "MERCHANT_PAYOUT_ACCOUNT_ACTIVATED",
  "MERCHANT_PAYOUT_ACCOUNT_DEACTIVATED",
]);

/**
 * Validates required Violet webhook headers (extracted values, not raw header names).
 *
 * ⚠️ SYNC: Must match `packages/shared/src/schemas/webhook.schema.ts`
 */
export const violetWebhookHeadersSchema = z.object({
  hmac: z.string().min(1, "X-Violet-Hmac header is required"),
  eventId: z.string().min(1, "X-Violet-Event-Id header is required"),
  eventType: webhookEventTypeSchema,
});

/**
 * H2 code review fix — Required transport headers WITHOUT eventType enum validation.
 *
 * Used in Phase 1 of two-phase header validation in handle-webhook/index.ts.
 * Validates that hmac, eventId, and eventType are present as non-empty strings,
 * but does NOT validate eventType against the known enum. This allows the handler
 * to accept unknown event types gracefully (200) instead of rejecting them (400),
 * preventing Violet from disabling the webhook endpoint when it sends event types
 * we haven't implemented yet (e.g., ORDER_* before Story 5.2).
 *
 * Phase 2 validation (in index.ts) then checks eventType against webhookEventTypeSchema
 * and returns 200 + log for unknown types.
 *
 * ⚠️ SYNC: Must match `packages/shared/src/schemas/webhook.schema.ts`
 *
 * @see handle-webhook/index.ts — Two-phase validation implementation
 */
export const violetRequiredHeadersSchema = z.object({
  hmac: z.string().min(1, "X-Violet-Hmac header is required"),
  eventId: z.string().min(1, "X-Violet-Event-Id header is required"),
  eventType: z.string().min(1, "X-Violet-Topic header is required"),
});

/**
 * Validates the Violet Offer webhook payload (OFFER_ADDED/UPDATED/REMOVED/DELETED).
 * Prices are in integer cents (e.g., 2999 = $29.99). Extra fields are stripped by Zod.
 *
 * ⚠️ SYNC: Must match `packages/shared/src/schemas/webhook.schema.ts`
 */

/**
 * Validates the metadata field on Offer/SKU responses.
 *
 * @see https://docs.violet.io/prism/catalog/metadata-syncing
 */
export const violetMetadataSchema = z.object({
  version: z.number(),
  type: z.enum(["STRING", "JSON", "INTEGER", "LONG", "DECIMAL", "BOOLEAN"]),
  external_type: z.string(),
  key: z.string(),
  value: z.string(),
  source: z.enum(["INTERNAL", "EXTERNAL"]),
});

export const violetOfferWebhookPayloadSchema = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string().optional(),
  source: z.string(),
  seller: z.string().optional(),
  vendor: z.string().optional(),
  merchant_id: z.number(),
  available: z.boolean(),
  visible: z.boolean(),
  min_price: z.number().optional(),
  max_price: z.number().optional(),
  currency: z.string().default("USD"),
  status: z.string(),
  tags: z.array(z.string()).optional(),
  external_url: z.string().optional(),
  skus: z.array(z.unknown()).optional(),
  albums: z.array(z.unknown()).optional(),
  metadata: z.array(violetMetadataSchema).optional(),
  date_last_modified: z.string().optional(),
});

/**
 * Validates the Violet Sync webhook payload (PRODUCT_SYNC_STARTED/COMPLETED/FAILED).
 * Monitoring-only — no product-level action taken.
 *
 * ⚠️ SYNC: Must match `packages/shared/src/schemas/webhook.schema.ts`
 */
export const violetSyncWebhookPayloadSchema = z.object({
  id: z.number(),
  merchant_id: z.number(),
  status: z.enum(["NOT_STARTED", "PENDING", "IN_PROGRESS", "COMPLETED", "FAILED", "ABORTED"]),
  total_products: z.number(),
  total_products_synced: z.number().optional(),
});

/**
 * Validates Violet MERCHANT_* webhook payload.
 *
 * Handles: MERCHANT_CONNECTED, MERCHANT_DISCONNECTED, MERCHANT_ENABLED, MERCHANT_DISABLED.
 * Fired when a merchant connects/disconnects or is enabled/disabled on Violet.
 * The `x-violet-connect-state` header may carry custom state from the Connect flow.
 *
 * @see https://docs.violet.io/prism/webhooks/events/merchant-webhooks
 * @see handle-webhook/index.ts — Merchant event routing
 *
 * ⚠️ SYNC: Must match `packages/shared/src/schemas/webhook.schema.ts`
 */
export const violetMerchantWebhookPayloadSchema = z.object({
  id: z.number(),
  name: z.string().optional(),
  status: z.string().optional(),
  connection_status: z.string().optional(),
  source: z.string().optional(),
  date_last_modified: z.string().optional(),
});

export type VioletMerchantPayload = z.infer<typeof violetMerchantWebhookPayloadSchema>;

// ─── Collection Webhook Schemas ────────────────────────────────────────

/**
 * Validates Violet COLLECTION_* webhook payload.
 *
 * Handles: COLLECTION_CREATED, COLLECTION_UPDATED, COLLECTION_REMOVED, COLLECTION_OFFERS_UPDATED.
 * Requires `sync_collections` feature flag enabled for the merchant.
 *
 * @see https://docs.violet.io/prism/webhooks/events/collection-webhooks
 *
 * ⚠️ SYNC: Must match `packages/shared/src/schemas/webhook.schema.ts`
 */
export const violetCollectionWebhookPayloadSchema = z.object({
  id: z.number(),
  name: z.string().optional(),
  description: z.string().optional(),
  type: z.enum(["CUSTOM", "AUTOMATED"]).optional(),
  merchant_id: z.number(),
  external_id: z.string().optional(),
  handle: z.string().optional(),
  image_url: z.string().optional(),
  media: z
    .object({
      source_url: z.string().optional(),
      alt: z.string().optional(),
      height: z.number().optional(),
      width: z.number().optional(),
    })
    .optional(),
  sort_order: z.number().optional(),
  date_last_modified: z.string().optional(),
});

export type VioletCollectionPayload = z.infer<typeof violetCollectionWebhookPayloadSchema>;

// ─── Order/Bag Webhook Schemas (Story 5.2) ────────────────────────────

/**
 * Validates Violet ORDER_* webhook payload.
 *
 * @see https://docs.violet.io/prism/webhooks/events/order-webhooks — Event payloads
 *
 * ⚠️ SYNC: Must match `packages/shared/src/schemas/webhook.schema.ts`
 */
export const violetOrderWebhookPayloadSchema = z.object({
  id: z.number(),
  status: z.string(),
  app_order_id: z.string().optional(),
  customer_id: z.number().optional(),
  date_last_modified: z.string().optional(),
});

/**
 * Validates Violet BAG_* webhook payload.
 *
 * @see https://docs.violet.io/prism/webhooks/events/order-webhooks — Bag event payloads
 *
 * ⚠️ SYNC: Must match `packages/shared/src/schemas/webhook.schema.ts`
 */
export const violetBagWebhookPayloadSchema = z.object({
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

export type WebhookEventType = z.infer<typeof webhookEventTypeSchema>;
export type VioletWebhookHeaders = z.infer<typeof violetWebhookHeadersSchema>;
export type VioletRequiredHeaders = z.infer<typeof violetRequiredHeadersSchema>;
export type VioletOfferPayload = z.infer<typeof violetOfferWebhookPayloadSchema>;
export type VioletSyncPayload = z.infer<typeof violetSyncWebhookPayloadSchema>;
export type VioletOrderPayload = z.infer<typeof violetOrderWebhookPayloadSchema>;
export type VioletBagPayload = z.infer<typeof violetBagWebhookPayloadSchema>;

// ─── Transfer Webhook Schemas ──────────────────────────────────────────

/**
 * Validates Violet TRANSFER_* webhook payload.
 *
 * ⚠️ SYNC: Must match `packages/shared/src/schemas/webhook.schema.ts`
 */
export const violetTransferWebhookPayloadSchema = z.object({
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

export type VioletTransferPayload = z.infer<typeof violetTransferWebhookPayloadSchema>;

// ─── Payment Transaction Webhook Schemas ──────────────────────────────

/**
 * Validates Violet PAYMENT_TRANSACTION_CAPTURE_STATUS_* webhook payload.
 *
 * @see https://docs.violet.io/prism/webhooks/events/payment-transaction-webhooks
 */
export const violetPaymentTransactionWebhookPayloadSchema = z.object({
  id: z.number(),
  order_id: z.number().optional(),
  bag_id: z.number().optional(),
  merchant_id: z.number().optional(),
  capture_status: z.string().optional(),
  amount: z.number().optional(),
  currency: z.string().optional(),
  payment_provider: z.string().optional(),
  payment_provider_transaction_id: z.string().optional().nullable(),
  date_created: z.string().optional(),
  date_last_modified: z.string().optional(),
});

export type VioletPaymentTransactionPayload = z.infer<
  typeof violetPaymentTransactionWebhookPayloadSchema
>;

// ─── Payout Account Webhook Schemas ──────────────────────────────────

/**
 * Validates Violet MERCHANT_PAYOUT_ACCOUNT_* webhook payload.
 *
 * @see https://docs.violet.io/prism/payments/payouts/prism-payout-accounts
 *
 * ⚠️ SYNC: Must match `packages/shared/src/schemas/webhook.schema.ts`
 */
export const violetPayoutAccountWebhookPayloadSchema = z.object({
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

export type VioletPayoutAccountPayload = z.infer<
  typeof violetPayoutAccountWebhookPayloadSchema
>;
