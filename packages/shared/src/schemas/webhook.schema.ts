/**
 * Zod validation schemas for Violet webhook payloads.
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
 * @see M2 code review fix — added sync documentation
 */

import { z } from "zod";

/**
 * All webhook event types our system currently handles.
 *
 * Offer events: triggered by Violet when merchant product data changes.
 * Sync events: triggered when a full catalog sync lifecycle changes.
 *
 * **Story 5.2 will add ORDER_* event types here.** Do NOT add them prematurely —
 * unhandled event types pass header validation but fall through to `default` in
 * the handler's switch, creating spurious "failed" rows in webhook_events and
 * polluting monitoring dashboards.
 *
 * @see handle-webhook/index.ts — Event routing switch statement
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
 * Validates extracted Violet webhook headers (after case-insensitive extraction).
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

export type WebhookEventType = z.infer<typeof webhookEventTypeSchema>;
export type VioletWebhookHeaders = z.infer<typeof violetWebhookHeadersSchema>;
export type VioletRequiredHeaders = z.infer<typeof violetRequiredHeadersSchema>;
export type VioletOfferPayload = z.infer<typeof violetOfferWebhookPayloadSchema>;
export type VioletSyncPayload = z.infer<typeof violetSyncWebhookPayloadSchema>;
