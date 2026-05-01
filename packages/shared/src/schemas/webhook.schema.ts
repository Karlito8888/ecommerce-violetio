/**
 * Zod validation schemas for Violet webhook payloads.
 *
 * ## Webhook Processing Pipeline Overview
 *
 * This file defines the validation layer for inbound Violet.io webhook events.
 * Violet sends server-to-server HTTP POST requests when commerce events occur
 * (product changes, order lifecycle, fulfillment updates). The pipeline is:
 *
 * ```
 * Violet.io → POST /handle-webhook → HMAC verify → Header validation (2-phase)
 *   → Idempotency check (webhook_events.event_id UNIQUE) → Payload validation (here)
 *   → Processor routing → DB updates → 200 response
 * ```
 *
 * ## Violet Webhook Event Types
 *
 * Violet emits these order-related webhook events (per official docs):
 * - `ORDER_ACCEPTED` — bag accepted by merchant (mapped to BAG_ACCEPTED in our system)
 * - `ORDER_UPDATED` — catch-all for order/bag property changes
 * - `ORDER_COMPLETED` — bag fulfillment complete
 * - `ORDER_SHIPPED` — bag shipped (mapped to BAG_SHIPPED with tracking data)
 * - `ORDER_DELIVERED` — bag delivered (mapped to BAG_COMPLETED in our system)
 * - `ORDER_REFUNDED` — full or partial refund processed
 * - `ORDER_CANCELLED` — bag cancelled by merchant
 * - `ORDER_FAILED` — order/bag creation failure
 *
 * Our system normalizes these into ORDER_* and BAG_* event types since Violet's
 * webhooks are bag-scoped (one event per merchant bag, identified by X-Violet-Bag-Id).
 *
 * ## Security: HMAC-SHA256 Signature Verification
 *
 * Every webhook carries an `X-Violet-Hmac` header containing a Base64-encoded
 * HMAC-SHA256 signature of the raw request body, keyed with VIOLET_APP_SECRET.
 * Validation uses Web Crypto `crypto.subtle.verify()` for constant-time comparison.
 *
 * @see {@link ../../../supabase/functions/_shared/webhookAuth.ts} — HMAC implementation
 * @see https://docs.violet.io/prism/webhooks/handling-webhooks — Violet webhook docs
 * @see https://docs.violet.io/prism/webhooks/events/order-webhooks — Order event types
 *
 * ## Idempotency
 *
 * Each webhook carries a unique `X-Violet-Event-Id` header. The handler inserts
 * this into `webhook_events.event_id` (UNIQUE constraint) before processing.
 * Duplicate deliveries hit the constraint and return 200 immediately.
 * Violet retries up to 10 times over 24 hours with exponential backoff on non-2xx.
 *
 * ## ⚠️ SYNC WARNING — Dual-copy architecture
 *
 * This file is the **canonical source of truth** for webhook validation schemas.
 * An identical copy exists at `supabase/functions/_shared/schemas.ts` because
 * Deno Edge Functions cannot import from Node/Bun workspace packages.
 *
 * **If you modify ANY schema here, you MUST update the Edge Function copy too.**
 * There is no automated sync — the Deno/Node boundary forces manual duplication.
 * A drift between the two copies means the shared package tests pass but the
 * Edge Function silently validates against different rules.
 *
 * Files to keep in sync:
 * - `packages/shared/src/schemas/webhook.schema.ts` ← YOU ARE HERE (canonical)
 * - `supabase/functions/_shared/schemas.ts` (Edge Function copy, webhook section)
 * - `packages/shared/src/types/order.types.ts` (TypeScript type definitions)
 *
 * @module webhook.schema
 * @see M2 code review fix — added sync documentation
 */

import { z } from "zod";

/**
 * All webhook event types our system handles.
 *
 * **Offer events** (Story 3.7): Triggered by Violet when merchant product data changes.
 * - `OFFER_ADDED` / `OFFER_UPDATED` — upsert product embeddings for AI search
 * - `OFFER_REMOVED` / `OFFER_DELETED` — soft-delete (set available=false)
 *
 * **Sync events** (Story 3.7): Triggered during full catalog sync lifecycle.
 * - `PRODUCT_SYNC_STARTED` / `COMPLETED` / `FAILED` — monitoring/audit only
 *
 * **Order events** (Story 5.2): Triggered when Violet order-level status changes.
 * - `ORDER_UPDATED` / `COMPLETED` / `CANCELED` / `REFUNDED` / `RETURNED`
 * - All delegate to `processOrderUpdated` which sets the Violet-provided status directly
 *
 * **Bag events** (Story 5.2): Triggered per-merchant bag within an order.
 * - `BAG_SUBMITTED` / `ACCEPTED` / `COMPLETED` / `CANCELED` — generic status update
 * - `BAG_SHIPPED` — includes tracking_number, tracking_url, carrier fields
 * - `BAG_REFUNDED` — triggers Violet Refund API fetch for amount/reason details
 *
 * ## Missing Violet events (intentionally not handled)
 *
 * Violet also emits `ORDER_ACCEPTED`, `ORDER_SHIPPED`, `ORDER_DELIVERED`, and
 * `ORDER_FAILED` per their docs. These are NOT in our enum because:
 * - We use bag-level events (BAG_*) as the source of truth for granular tracking
 * - Order-level status is derived from bag statuses via `deriveAndUpdateOrderStatus()`
 * - Unknown event types are accepted with 200 (two-phase validation) to prevent
 *   Violet from disabling our webhook endpoint
 *
 * @see https://docs.violet.io/prism/webhooks/events/order-webhooks — Violet event reference
 * @see handle-webhook/index.ts — Event routing switch statement
 *
 * ⚠️ SYNC: Must match `supabase/functions/_shared/schemas.ts`
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
 * Validates extracted Violet webhook headers (after case-insensitive extraction).
 *
 * Used in Phase 2 of two-phase validation when the event type is confirmed to be
 * in our handled enum. Phase 1 uses {@link violetRequiredHeadersSchema} which accepts
 * any string for eventType.
 *
 * Headers extracted from the HTTP request:
 * - `X-Violet-Hmac` → hmac: HMAC-SHA256 signature (Base64) for authentication
 * - `X-Violet-Event-Id` → eventId: unique event identifier for idempotency
 * - `X-Violet-Topic` → eventType: the webhook event type (e.g., "ORDER_UPDATED")
 *
 * @see https://docs.violet.io/prism/webhooks/handling-webhooks — Header documentation
 * @see extractWebhookHeaders in webhookAuth.ts — Header extraction logic
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
 * ⚠️ SYNC: Must match `supabase/functions/_shared/schemas.ts`
 *
 * @see handle-webhook/index.ts — Two-phase validation implementation
 */
export const violetRequiredHeadersSchema = z.object({
  hmac: z.string().min(1, "X-Violet-Hmac header is required"),
  eventId: z.string().min(1, "X-Violet-Event-Id header is required"),
  eventType: z.string().min(1, "X-Violet-Topic header is required"),
});

/**
 * Validates Violet Offer webhook payload.
 * Prices are in integer cents. Extra fields are stripped by Zod's default behavior.
 */

/**
 * Validates the metadata field on Offer/SKU responses.
 *
 * Metadata is included only when:
 * 1. `sync_metadata` (Offer-level) or `sync_sku_metadata` (SKU-level) flag is enabled
 * 2. The request includes `?include=metadata` or `?include=sku_metadata`
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
  /**
   * Offer status from Violet.
   *
   * Epic 3 Review — Fix I3: Changed from z.enum([...]) to z.string().
   *
   * Violet's API documentation lists known statuses (AVAILABLE, UNAVAILABLE,
   * DISABLED, DISABLED_AVAILABLE, DISABLED_UNAVAILABLE, FOR_DELETION, ARCHIVED),
   * but the actual API may return undocumented compound statuses. The catalog
   * adapter (violetAdapter.ts) already uses z.string() for this field defensively.
   *
   * Using z.string() here prevents webhook rejection when Violet sends an
   * unexpected status value. The webhook handler processes all offer events
   * regardless of status — the `available` boolean field determines searchability.
   *
   * ⚠️ SYNC: Must match the other copy (see SYNC WARNING at top of file)
   */
  status: z.string(),
  tags: z.array(z.string()).optional(),
  external_url: z.string().optional(),
  skus: z.array(z.unknown()).optional(),
  albums: z.array(z.unknown()).optional(),
  metadata: z.array(violetMetadataSchema).optional(),
  date_last_modified: z.string().optional(),
});

/**
 * Validates Violet Sync webhook payload.
 * Monitoring-only — no product-level action taken.
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
 *
 * @see https://docs.violet.io/prism/webhooks/events/merchant-webhooks
 *
 * ⚠️ SYNC: Must match `supabase/functions/_shared/schemas.ts`
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
 * Fired when a merchant's collection data changes. Requires `sync_collections`
 * feature flag enabled for the merchant.
 *
 * COLLECTION_CREATED: New collection created (may have 0 offers initially).
 * COLLECTION_UPDATED: Collection metadata changed (name, description, image).
 *   Does NOT fire for offer composition changes — use COLLECTION_OFFERS_UPDATED.
 * COLLECTION_REMOVED: Collection no longer available. Offers remain available.
 * COLLECTION_OFFERS_UPDATED: Offers added to or removed from the collection.
 *   Critical for maintaining accurate collection content.
 *
 * @see https://docs.violet.io/prism/webhooks/events/collection-webhooks
 *
 * ⚠️ SYNC: Must match `supabase/functions/_shared/schemas.ts`
 */
export const violetCollectionWebhookPayloadSchema = z.object({
  id: z.number(),
  name: z.string().optional(),
  description: z.string().optional(),
  type: z.enum(["CUSTOM", "AUTOMATED"]).optional(),
  merchant_id: z.number(),
  external_id: z.string().optional(),
  handle: z.string().optional(),
  // Violet API uses media.source_url, but webhooks may send image_url as a flat field.
  // Accept both to be safe. See: GET /catalog/collections response schema.
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
 * Handles: ORDER_UPDATED, ORDER_COMPLETED, ORDER_CANCELED, ORDER_REFUNDED, ORDER_RETURNED.
 *
 * Status is `z.string()` (not a strict enum) because Violet may send undocumented
 * status values. Known statuses include: IN_PROGRESS, COMPLETED, CANCELED, REFUNDED,
 * PARTIALLY_REFUNDED, but the list is not exhaustive per Violet's docs.
 *
 * The `app_order_id` field contains our internal order reference (set during checkout
 * via Violet's Cart API). Used for correlating Violet orders with our `orders` table.
 *
 * @see https://docs.violet.io/prism/webhooks/events/order-webhooks — Event payloads
 * @see processOrderUpdated in orderProcessors.ts — Processing logic
 *
 * ⚠️ SYNC: Must match `supabase/functions/_shared/schemas.ts`
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
 * Handles: BAG_SUBMITTED, BAG_ACCEPTED, BAG_SHIPPED, BAG_COMPLETED, BAG_CANCELED, BAG_REFUNDED.
 *
 * Bags are per-merchant subdivisions of an order. Each bag is fulfilled independently
 * by its merchant, so shipping/refund events arrive at the bag level. The `order_id`
 * field links back to the parent Violet order for status derivation.
 *
 * **Tracking fields** (populated on BAG_SHIPPED):
 * - `tracking_number` — carrier tracking number
 * - `tracking_url` — direct tracking link
 * - `carrier` — shipping carrier name (e.g., "UPS", "USPS", "FedEx")
 *
 * **Financial fields** (populated on BAG_REFUNDED):
 * - `financial_status` — e.g., "REFUNDED", "PARTIALLY_REFUNDED"
 * - Actual refund amounts are NOT in the webhook payload; they must be fetched
 *   from the Violet Refund API (`GET /v1/orders/{id}/bags/{id}/refunds`)
 *
 * @see https://docs.violet.io/prism/webhooks/events/order-webhooks — Bag event payloads
 * @see processBagShipped in orderProcessors.ts — Tracking data persistence
 * @see processBagRefunded in orderProcessors.ts — Refund detail fetching
 *
 * ⚠️ SYNC: Must match `supabase/functions/_shared/schemas.ts`
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
 * Handles: TRANSFER_SENT, TRANSFER_FAILED, TRANSFER_REVERSED, TRANSFER_PARTIALLY_REVERSED.
 * Fired when a transfer to a merchant succeeds, fails, or is reversed.
 * Critical for monitoring failed payouts and triggering retries.
 *
 * @see https://docs.violet.io/prism/payments/payments-during-checkout/guides/handling-failed-transfers
 * @see https://docs.violet.io/prism/payments/payments-during-checkout/transfer-reversals
 *
 * ⚠️ SYNC: Must match `supabase/functions/_shared/schemas.ts`
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
        // Search API format (numeric code)
        error_code: z.number().optional(),
        error_message: z.string().optional(),
        // Webhook format (string code) — Violet uses different error structures
        // depending on the source (webhook vs API search).
        // @see https://docs.violet.io/prism/payments/payments-during-checkout/guides/handling-failed-transfers
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

// ─── Payout Account Webhook Schemas ──────────────────────────────

/**
 * Validates Violet MERCHANT_PAYOUT_ACCOUNT_* webhook payload.
 *
 * Handles: MERCHANT_PAYOUT_ACCOUNT_CREATED, MERCHANT_PAYOUT_ACCOUNT_REQUIREMENTS_UPDATED.
 * Fired when a merchant's Prism Pay Account is created or when Stripe updates
 * KYC requirements (currently_due, past_due, pending_verification).
 *
 * Critical for proactive monitoring: if a merchant has `past_due` requirements,
 * Stripe may disable their account, blocking payouts.
 *
 * Model matches the PPA JSON from Violet docs:
 * @see https://docs.violet.io/prism/payments/payouts/prism-payout-accounts
 *
 * ⚠️ SYNC: Must match `supabase/functions/_shared/schemas.ts`
 */
export const violetPayoutAccountWebhookPayloadSchema = z.object({
  /** Violet Payout Account ID */
  id: z.number(),
  /** Type of account entity — always MERCHANT for merchant payout accounts */
  account_type: z.string().optional(),
  /** Violet Merchant ID */
  account_id: z.number().optional(),
  /** Violet App ID this PPA is associated with */
  app_id: z.number().optional(),
  /** Merchant ID (alternate field — some payloads use this) */
  merchant_id: z.number().optional(),
  /** Whether this is the currently active PPA for the merchant */
  is_active: z.boolean().optional(),
  /** ISO-3166-1 alpha-2 country code of the bank */
  country_code: z.string().optional(),
  /** Payment provider: STRIPE or EXTERNAL */
  payment_provider: z.string().optional(),
  /** Stripe Connect account ID (e.g., "acct_1R42bBHasdfghjk2") */
  payment_provider_account_id: z.string().optional().nullable(),
  /** Stripe account details (KYC status, requirements, etc.) */
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
  /** PPA-level errors */
  errors: z.array(z.string()).optional(),
  date_created: z.string().optional(),
  date_last_modified: z.string().optional(),
});

export type VioletPayoutAccountPayload = z.infer<typeof violetPayoutAccountWebhookPayloadSchema>;
