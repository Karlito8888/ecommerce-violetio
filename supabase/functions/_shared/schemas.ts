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

// ─── Webhook Schemas (Story 3.7) ─────────────────────────────────────
//
// These schemas validate inbound Violet webhook payloads in the handle-webhook
// Edge Function. They mirror the TypeScript types in packages/shared/src/types/order.types.ts
// and MUST be kept in sync (same Deno/Node constraint as the schemas above).

/**
 * All webhook event types our system currently handles.
 *
 * Offer events trigger product embedding updates.
 * Sync events are logged for monitoring only.
 *
 * **Story 5.2 will add ORDER_* event types.** Do NOT add them prematurely —
 * unhandled types pass header validation but fall through to `default` in
 * the handler's switch, creating spurious "failed" rows in webhook_events.
 *
 * ⚠️ SYNC WARNING: This schema is a manual copy of
 * `packages/shared/src/schemas/webhook.schema.ts` (Deno cannot import Node workspace
 * packages). Any change here MUST be mirrored there, and vice versa.
 *
 * @see https://docs.violet.io/prism/webhooks — Violet event type reference
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

export type WebhookEventType = z.infer<typeof webhookEventTypeSchema>;
export type VioletWebhookHeaders = z.infer<typeof violetWebhookHeadersSchema>;
export type VioletRequiredHeaders = z.infer<typeof violetRequiredHeadersSchema>;
export type VioletOfferPayload = z.infer<typeof violetOfferWebhookPayloadSchema>;
export type VioletSyncPayload = z.infer<typeof violetSyncWebhookPayloadSchema>;
