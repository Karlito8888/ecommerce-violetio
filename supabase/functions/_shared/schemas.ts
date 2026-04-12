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
 * - `packages/shared/src/schemas/search.schema.ts` → search schemas below
 * - `packages/shared/src/schemas/webhook.schema.ts` → webhook schemas below
 *
 * @see M2 code review fix — added sync documentation
 */

import { z } from "npm:zod";

/** Schema for generate-embeddings request body. */
export const generateEmbeddingsRequestSchema = z.object({
  productId: z.string().min(1, "productId is required"),
  productName: z.string().min(1, "productName is required"),
  description: z.string(),
  vendor: z.string(),
  tags: z.array(z.string()),
  category: z.string(),
});

/**
 * Schema for search-products request body.
 *
 * Epic 3 Review — Fix C3: Aligned with canonical source in
 * `packages/shared/src/schemas/search.schema.ts`. Changes:
 * - Added `.int()` to minPrice/maxPrice (prices are integer cents)
 * - Added `merchantId` filter (consistency with canonical source)
 *
 * ⚠️ SYNC: Must match `packages/shared/src/schemas/search.schema.ts`
 */
export const searchQuerySchema = z.object({
  query: z
    .string()
    .min(2, "Search query must be at least 2 characters")
    .max(500, "Search query must be at most 500 characters"),
  filters: z
    .object({
      category: z.string().optional(),
      minPrice: z.number().int().nonnegative().optional(),
      maxPrice: z.number().int().nonnegative().optional(),
      inStock: z.boolean().optional(),
      merchantId: z.string().optional(),
    })
    .optional(),
  limit: z.number().int().min(1).max(50).optional(),
});

export type GenerateEmbeddingsInput = z.infer<typeof generateEmbeddingsRequestSchema>;
export type SearchQueryInput = z.infer<typeof searchQuerySchema>;

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
 * **Offer events** (Story 3.7): Product embedding upsert/soft-delete for AI search.
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
  "OFFER_ADDED",
  "OFFER_UPDATED",
  "OFFER_REMOVED",
  "OFFER_DELETED",
  "PRODUCT_SYNC_STARTED",
  "PRODUCT_SYNC_COMPLETED",
  "PRODUCT_SYNC_FAILED",
  "MERCHANT_CONNECTED",
  "MERCHANT_DISCONNECTED",
  "MERCHANT_ENABLED",
  "MERCHANT_DISABLED",
  "COLLECTION_CREATED",
  "COLLECTION_UPDATED",
  "COLLECTION_REMOVED",
  "COLLECTION_OFFERS_UPDATED",
  "ORDER_UPDATED",
  "ORDER_COMPLETED",
  "ORDER_CANCELED",
  "ORDER_REFUNDED",
  "ORDER_RETURNED",
  "BAG_SUBMITTED",
  "BAG_ACCEPTED",
  "BAG_SHIPPED",
  "BAG_COMPLETED",
  "BAG_CANCELED",
  "BAG_REFUNDED",
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
  /**
   * Offer metadata from merchant's custom product data.
   * Present when `sync_metadata` flag is enabled for the merchant.
   *
   * @see https://docs.violet.io/prism/catalog/metadata-syncing
   */
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
 * Status is `z.string()` (not a strict enum) — Violet may send undocumented values.
 * `app_order_id` correlates Violet orders with our `orders` table.
 *
 * @see https://docs.violet.io/prism/webhooks/events/order-webhooks — Event payloads
 * @see processOrderUpdated in handle-webhook/orderProcessors.ts
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
 * Handles: BAG_SUBMITTED, BAG_ACCEPTED, BAG_SHIPPED, BAG_COMPLETED, BAG_CANCELED, BAG_REFUNDED.
 * BAG_SHIPPED populates tracking_number, tracking_url, carrier.
 * BAG_REFUNDED triggers a Violet Refund API fetch (amounts not in webhook payload).
 * `order_id` links to parent Violet order for derived status computation.
 *
 * @see https://docs.violet.io/prism/webhooks/events/order-webhooks — Bag event payloads
 * @see processBagShipped, processBagRefunded in handle-webhook/orderProcessors.ts
 *
 * ⚠️ SYNC: Must match `packages/shared/src/schemas/webhook.schema.ts`
 */
export const violetBagWebhookPayloadSchema = z.object({
  id: z.number(),
  order_id: z.number(),
  status: z.string(),
  financial_status: z.string().optional(),
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

// ─── Recommendation Schemas (Story 6.5) ────────────────────────────
//
// Validates get-recommendations Edge Function input.
// This is a server-only request schema — no Node-side mirror needed.
// The Node-side recommendation.schema.ts only contains response schemas
// (used by the client to validate Edge Function output).

/** Schema for get-recommendations request body (Deno-only, no Node mirror). */
export const recommendationRequestSchema = z.object({
  product_id: z.string().min(1, "product_id is required"),
  user_id: z.string().optional(),
  limit: z.number().int().min(1).max(20).optional(),
});

export type RecommendationRequestInput = z.infer<typeof recommendationRequestSchema>;
