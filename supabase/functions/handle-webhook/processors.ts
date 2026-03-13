/**
 * Webhook event processors for Violet offer and sync events.
 *
 * Each processor handles a specific event type and updates the webhook_events
 * row with the processing outcome (status: processed | failed).
 *
 * ## Architecture: Why separate processors?
 *
 * The main handler (index.ts) is responsible for HTTP lifecycle (HMAC, idempotency,
 * quick 200 response). Processors handle the business logic in isolation, making
 * each event type independently testable and modifiable.
 *
 * ## Embedding generation: Inter-function call
 *
 * OFFER_ADDED and OFFER_UPDATED call the existing generate-embeddings Edge Function
 * via `supabase.functions.invoke()` rather than calling OpenAI directly.
 * This keeps embedding logic in one place — if the model or text format changes,
 * only generate-embeddings needs updating.
 *
 * @see generate-embeddings/index.ts — The target function for embedding upserts
 */

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import type { VioletOfferPayload, VioletSyncPayload } from "../_shared/schemas.ts";

/**
 * Marks a webhook event as processed or failed in the database.
 *
 * Exported so that `index.ts` can also mark events as failed during
 * routing (e.g., Zod validation failure, unknown event type) without
 * duplicating this logic.
 *
 * Always called after processing — ensures the webhook_events table reflects
 * the actual outcome regardless of success or failure.
 *
 * @see L1 code review fix — consolidated from duplicate `markFailed()` in index.ts
 */
export async function updateEventStatus(
  supabase: SupabaseClient,
  eventId: string,
  status: "processed" | "failed",
  errorMessage?: string,
): Promise<void> {
  const update: Record<string, unknown> = {
    status,
    processed_at: new Date().toISOString(),
  };
  if (errorMessage) {
    update.error_message = errorMessage;
  }

  const { error } = await supabase.from("webhook_events").update(update).eq("event_id", eventId);

  if (error) {
    // Log but don't throw — the webhook was already processed, status update is best-effort
    console.error(`Failed to update webhook_events status for ${eventId}:`, error.message);
  }
}

/**
 * Processes OFFER_ADDED events — generates embeddings for a new product.
 *
 * Calls generate-embeddings Edge Function which:
 * 1. Concatenates product fields into searchable text
 * 2. Generates OpenAI text-embedding-3-small vector (1536 dims)
 * 3. Upserts into product_embeddings table (ON CONFLICT product_id)
 *
 * ## H1 code review fix — Restore `available = true` after embedding generation
 *
 * The `generate-embeddings` function upserts `product_id`, `product_name`,
 * `text_content`, and `embedding` — but it does NOT touch the `available` column.
 * If a product was previously marked unavailable via OFFER_REMOVED (which sets
 * `available = false`), a subsequent OFFER_ADDED would re-generate the embedding
 * but the product would remain **invisible** in search because `match_products`
 * filters on `available = true`.
 *
 * Fix: after successful embedding generation, explicitly set `available = true`
 * on the product_embeddings row. This ensures re-listed products become
 * searchable again immediately.
 *
 * We don't modify `generate-embeddings` itself because it's a generic utility
 * that shouldn't know about availability semantics — that's the webhook
 * processor's responsibility.
 *
 * The product becomes immediately searchable via AI semantic search after this.
 */
export async function processOfferAdded(
  supabase: SupabaseClient,
  eventId: string,
  payload: VioletOfferPayload,
): Promise<void> {
  try {
    /**
     * Calls generate-embeddings to create/update the product's search vector.
     *
     * **category field:** We pass the first tag as a best-effort category signal.
     * Violet's Offer payload has no dedicated `category` field — `source` is the
     * e-commerce platform (SHOPIFY, BIGCOMMERCE) which would pollute embeddings
     * with irrelevant platform names. Tags are merchant-curated and closer to
     * actual product categories (e.g., "electronics", "headphones").
     *
     * If no tags exist, empty string is fine — generate-embeddings concatenates
     * all text fields, so missing category just means slightly less context.
     *
     * @see M1 code review fix — previously used `payload.source` as category
     */
    const { error } = await supabase.functions.invoke("generate-embeddings", {
      body: {
        productId: String(payload.id),
        productName: payload.name,
        description: payload.description ?? "",
        vendor: payload.vendor ?? "",
        tags: payload.tags ?? [],
        category: payload.tags?.[0] ?? "",
      },
    });

    if (error) {
      await updateEventStatus(
        supabase,
        eventId,
        "failed",
        `generate-embeddings failed: ${error.message}`,
      );
      return;
    }

    /**
     * H1 code review fix — Restore availability after embedding upsert.
     *
     * The generate-embeddings function does `upsert({ product_id, product_name,
     * text_content, embedding }, { onConflict: "product_id" })` which does NOT
     * touch the `available` column. Without this explicit update, a product
     * previously removed (OFFER_REMOVED → available=false) would get new embeddings
     * but remain hidden from search results forever.
     *
     * This is a no-op for genuinely new products (available defaults to true),
     * but essential for re-listed products.
     */
    const { error: availError } = await supabase
      .from("product_embeddings")
      .update({ available: true })
      .eq("product_id", String(payload.id));

    if (availError) {
      // Non-fatal: embedding was generated successfully, availability update is best-effort.
      // The product may still be hidden but the embedding data is correct.
      // A subsequent OFFER_UPDATED will retry the availability restore.
      console.error(
        `[handle-webhook] Failed to restore availability for product ${payload.id}:`,
        availError.message,
      );
    }

    await updateEventStatus(supabase, eventId, "processed");
  } catch (err) {
    await updateEventStatus(
      supabase,
      eventId,
      "failed",
      err instanceof Error ? err.message : "Unknown error in processOfferAdded",
    );
  }
}

/**
 * Processes OFFER_UPDATED events — re-generates embeddings for a changed product.
 *
 * Identical to OFFER_ADDED because generate-embeddings already does upsert
 * (ON CONFLICT product_id DO UPDATE). Changed product data → new embedding vector.
 */
export async function processOfferUpdated(
  supabase: SupabaseClient,
  eventId: string,
  payload: VioletOfferPayload,
): Promise<void> {
  return processOfferAdded(supabase, eventId, payload);
}

/**
 * Processes OFFER_REMOVED and OFFER_DELETED events.
 *
 * Sets `available = false` on the product_embeddings row instead of deleting it.
 * This is a soft-delete — the embedding data is preserved for potential reactivation,
 * and the match_products RPC already filters out `available = false` rows.
 *
 * Why not hard delete? Violet may re-send OFFER_ADDED if a merchant re-enables
 * a product. Keeping the row avoids regenerating the embedding unnecessarily.
 */
export async function processOfferRemoved(
  supabase: SupabaseClient,
  eventId: string,
  payload: VioletOfferPayload,
): Promise<void> {
  try {
    const { error } = await supabase
      .from("product_embeddings")
      .update({ available: false })
      .eq("product_id", String(payload.id));

    if (error) {
      await updateEventStatus(
        supabase,
        eventId,
        "failed",
        `Mark unavailable failed: ${error.message}`,
      );
      return;
    }

    await updateEventStatus(supabase, eventId, "processed");
  } catch (err) {
    await updateEventStatus(
      supabase,
      eventId,
      "failed",
      err instanceof Error ? err.message : "Unknown error in processOfferRemoved",
    );
  }
}

/** Alias — OFFER_DELETED uses the same logic as OFFER_REMOVED. */
export const processOfferDeleted = processOfferRemoved;

/**
 * Processes sync lifecycle events (PRODUCT_SYNC_STARTED/COMPLETED/FAILED).
 *
 * These are monitoring-only — no product-level action is taken.
 * The event is already stored in webhook_events (by the main handler),
 * so we just mark it as processed for the audit trail.
 *
 * A future monitoring dashboard can query webhook_events filtered by
 * event_type LIKE 'PRODUCT_SYNC_%' to show sync history.
 */
export async function processSyncEvent(
  supabase: SupabaseClient,
  eventId: string,
  _payload: VioletSyncPayload,
): Promise<void> {
  await updateEventStatus(supabase, eventId, "processed");
}
