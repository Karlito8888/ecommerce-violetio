/**
 * Webhook event processors for Violet offer and sync events (Epic 3 / Story 3.7).
 *
 * Each processor handles a specific Violet webhook event type and updates the
 * `webhook_events` row with the processing outcome (status: processed | failed).
 *
 * ## Pipeline position
 *
 * These processors are invoked by `handle-webhook/index.ts` AFTER:
 * 1. HMAC signature verification (webhookAuth.ts)
 * 2. Idempotency check (webhook_events.event_id UNIQUE)
 * 3. Event claim (INSERT with status: received)
 * 4. Zod payload validation (schemas.ts)
 *
 * The processor's job is purely business logic — no HTTP, no auth, no deduplication.
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
 * ## Error handling strategy
 *
 * All processors catch errors internally and call `updateEventStatus("failed", msg)`.
 * They never throw — the caller (index.ts) has a catch-all, but processors are
 * self-contained to provide precise error messages in webhook_events.error_message.
 * The HTTP response is ALWAYS 200 regardless of processor outcome.
 *
 * @module processors
 * @see generate-embeddings/index.ts — The target function for embedding upserts
 * @see orderProcessors.ts — Order/bag event processors (Story 5.2)
 * @see https://docs.violet.io/prism/webhooks/handling-webhooks — Violet best practices
 */

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

import { violetFetch } from "../_shared/fetchWithRetry.ts";
import type {
  VioletOfferPayload,
  VioletSyncPayload,
  VioletCollectionPayload,
} from "../_shared/schemas.ts";

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
        merchantId: payload.merchant_id != null ? String(payload.merchant_id) : undefined,
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

/**
 * Processes MERCHANT_CONNECTED webhook event.
 *
 * Fired when a merchant completes Violet Connect onboarding.
 * Stores merchant info in the `merchants` table (central source of truth),
 * logs the connection for audit trail, auto-enables feature flags,
 * logs the connection for audit trail, and auto-enables feature flags.
 *
 * ## Idempotency
 * Uses UPSERT (ON CONFLICT merchant_id) so duplicate webhooks are safe.
 *
 * @see https://docs.violet.io/prism/webhooks/events/merchant-webhooks
 * @see https://docs.violet.io/prism/violet-connect/guides/detecting-merchants-post-connection
 */
export async function processMerchantConnected(
  supabase: SupabaseClient,
  eventId: string,
  payload: { id: number; name?: string; source?: string },
): Promise<void> {
  const merchantId = String(payload.id);
  const merchantName = payload.name ?? "Unknown";
  const source = payload.source ?? "Unknown";

  console.log(
    `[merchant] Merchant connected: id=${merchantId} name="${merchantName}" source=${source}`,
  );

  // ─── Upsert into merchants table (central source of truth) ────────
  // ON CONFLICT handles idempotent webhook deliveries gracefully.
  const { error: merchantError } = await supabase.from("merchants").upsert(
    {
      merchant_id: merchantId,
      name: merchantName,
      platform: source,
      status: "CONNECTED",
    },
    { onConflict: "merchant_id" },
  );

  if (merchantError) {
    // Non-blocking — the merchant connection webhook is still acknowledged.
    // The merchant row can be created on next connection event or manually.
    console.error(
      `[merchant] Failed to upsert merchants row for ${merchantId}:`,
      merchantError.message,
    );
  }

  // Store a log entry in error_logs for the admin dashboard
  await supabase.from("error_logs").insert({
    source: "webhook",
    error_type: "MERCHANT_CONNECTED",
    message: `Merchant "${merchantName}" (id=${merchantId}, platform=${source}) connected`,
    context: { merchant_id: merchantId, merchant_name: merchantName, source },
  });

  // ─── Auto-enable feature flags for rich catalog data ───────────
  // Per Violet docs, these flags must be toggled per-merchant:
  //   sync_collections     → daily collection sync + COLLECTION_* webhooks
  //   sync_metadata        → Offer-level metadata (Shopify metafields)
  //   sync_sku_metadata    → SKU-level metadata (variant enrichments)
  //   contextual_pricing   → Presentment currencies (prices per currency)
  // We enable all four on connection so the catalog is fully enriched.
  // Failures are logged but non-blocking — the merchant is still connected.
  // @see https://docs.violet.io/api-reference/merchants/configuration/toggle-merchant-configuration-global-feature-flag
  await autoEnableMerchantFlags(merchantId);

  await updateEventStatus(supabase, eventId, "processed");
}

/**
 * Processes MERCHANT_DISCONNECTED webhook event.
 *
 * Fired when a merchant disconnects their store from Violet.
 * Updates the merchants table status and logs the disconnection.
 * Products from this merchant will stop syncing.
 *
 * @see https://docs.violet.io/prism/webhooks/events/merchant-webhooks
 */
export async function processMerchantDisconnected(
  supabase: SupabaseClient,
  eventId: string,
  payload: { id: number; name?: string },
): Promise<void> {
  const merchantId = String(payload.id);
  const merchantName = payload.name ?? "Unknown";

  console.warn(
    `[merchant] Merchant disconnected: id=${merchantId} name="${merchantName}"`,
  );

  // ─── Update merchants table ────────────────────────────────────────
  const { error: merchantError } = await supabase
    .from("merchants")
    .update({ status: "DISCONNECTED" })
    .eq("merchant_id", merchantId);

  if (merchantError) {
    console.error(
      `[merchant] Failed to update merchants status for ${merchantId}:`,
      merchantError.message,
    );
  }

  // ─── Soft-delete merchant's product embeddings ────────────────────
  // Per Violet docs: after disconnection, the app loses all access to the
  // merchant's catalog. We proactively mark all embeddings as unavailable
  // so they disappear from search immediately, rather than waiting for
  // individual OFFER_REMOVED webhooks (which may arrive in bulk later).
  // Embeddings are preserved for potential reactivation if the merchant
  // reconnects (same as OFFER_REMOVED soft-delete pattern).
  // @see https://docs.violet.io/prism/merchants/merchant-app-connections
  const { error: embeddingsError } = await supabase
    .from("product_embeddings")
    .update({ available: false })
    .eq("merchant_id", merchantId)
    .eq("available", true);

  if (embeddingsError) {
    // Non-blocking — OFFER_REMOVED webhooks will also handle this.
    console.error(
      `[merchant] Failed to soft-delete embeddings for disconnected merchant ${merchantId}:`,
      embeddingsError.message,
    );
  } else {
    console.log(
      `[merchant] Soft-deleted product embeddings for disconnected merchant ${merchantId}`,
    );
  }

  // Store a log entry for the admin dashboard
  await supabase.from("error_logs").insert({
    source: "webhook",
    error_type: "MERCHANT_DISCONNECTED",
    message: `Merchant "${merchantName}" (id=${merchantId}) disconnected`,
    context: { merchant_id: merchantId, merchant_name: merchantName },
  });

  await updateEventStatus(supabase, eventId, "processed");
}

/**
 * Processes MERCHANT_ENABLED/DISABLED webhook events.
 *
 * MERCHANT_ENABLED: merchant reactivated (e.g., Shopify plan restored).
 * MERCHANT_DISABLED: merchant deactivated (e.g., Shopify app uninstalled, plan frozen).
 *
 * Updates the merchants table status and logs for operational visibility.
 *
 * @see https://docs.violet.io/prism/webhooks/events/merchant-webhooks
 */
export async function processMerchantStatusChange(
  supabase: SupabaseClient,
  eventId: string,
  eventType: string,
  payload: { id: number; name?: string; status?: string },
  reason?: string | null,
): Promise<void> {
  const merchantId = String(payload.id);
  const merchantName = payload.name ?? "Unknown";
  const status = payload.status ?? "unknown";

  const isEnabled = eventType === "MERCHANT_ENABLED";
  const reasonText = reason ? ` reason="${reason}"` : "";
  console.log(
    `[merchant] Merchant ${isEnabled ? "enabled" : "disabled"}: id=${merchantId} name="${merchantName}" status=${status}${reasonText}`,
  );

  // ─── Update merchants table ────────────────────────────────────────
  const { error: merchantError } = await supabase
    .from("merchants")
    .update({ status: isEnabled ? "ENABLED" : "DISABLED" })
    .eq("merchant_id", merchantId);

  if (merchantError) {
    console.error(
      `[merchant] Failed to update merchants status for ${merchantId}:`,
      merchantError.message,
    );
  }

  await supabase.from("error_logs").insert({
    source: "webhook",
    error_type: eventType,
    message: `Merchant "${merchantName}" (id=${merchantId}) ${isEnabled ? "enabled" : "disabled"}${reason ? ` — reason: ${reason}` : ""}`,
    context: { merchant_id: merchantId, merchant_name: merchantName, status, reason: reason ?? undefined },
  });

  await updateEventStatus(supabase, eventId, "processed");
}

// ─── Collection Processors ──────────────────────────────────────────────

/**
 * Processes COLLECTION_CREATED webhook event.
 *
 * Fired when a new collection is created by a merchant.
 * Note: The collection may have 0 offers initially — use COLLECTION_OFFERS_UPDATED
 * to track when offers are added.
 *
 * Stores the collection in the `collections` table for UI navigation.
 *
 * @see https://docs.violet.io/prism/webhooks/events/collection-webhooks
 */
export async function processCollectionCreated(
  _supabase: SupabaseClient,
  eventId: string,
  payload: VioletCollectionPayload,
): Promise<void> {
  console.log(
    `[collection] Collection created (no-op): id=${payload.id} name="${payload.name ?? "Unknown"}" — fetched directly from Violet API`,
  );
  await updateEventStatus(_supabase, eventId, "processed");
}

/**
 * Processes COLLECTION_UPDATED webhook event.
 *
 * Fired when collection metadata changes (name, description, image).
 * Does NOT fire for offer composition changes — that's COLLECTION_OFFERS_UPDATED.
 *
 * @see https://docs.violet.io/prism/webhooks/events/collection-webhooks
 */
export async function processCollectionUpdated(
  _supabase: SupabaseClient,
  eventId: string,
  payload: VioletCollectionPayload,
): Promise<void> {
  console.log(
    `[collection] Collection updated (no-op): id=${payload.id} name="${payload.name ?? "Unknown"}" — fetched directly from Violet API`,
  );
  await updateEventStatus(_supabase, eventId, "processed");
}

/**
 * Processes COLLECTION_REMOVED webhook event.
 *
 * Fired when a collection is no longer available.
 * The individual offers within it remain available — they may belong to other collections
 * or exist as standalone offers.
 *
 * Soft-deletes the collection (status = REMOVED) and clears the junction table.
 *
 * @see https://docs.violet.io/prism/webhooks/events/collection-webhooks
 */
export async function processCollectionRemoved(
  _supabase: SupabaseClient,
  eventId: string,
  payload: VioletCollectionPayload,
): Promise<void> {
  console.log(
    `[collection] Collection removed (no-op): id=${payload.id} — fetched directly from Violet API`,
  );
  await updateEventStatus(_supabase, eventId, "processed");
}

/**
 * Processes COLLECTION_OFFERS_UPDATED webhook event.
 *
 * Fired when offers are added to or removed from a collection.
 * This is the critical event for maintaining accurate collection content.
 *
 * ## Strategy: full reconciliation via `/offers/ids` endpoint
 * The webhook payload contains collection metadata but does NOT enumerate
 * which specific offers changed. We must fetch the current full list of offer
 * IDs from Violet and reconcile the `collection_offers` junction table.
 *
 * We use `GET /catalog/collections/{id}/offers/ids` (not `/offers`) because:
 * - We only need IDs for the junction table, not full offer objects
 * - The `/ids` endpoint returns `content: int64[]` — orders of magnitude lighter
 * - Reduces bandwidth and parsing overhead for large collections
 *
 * Reconciliation is atomic (DELETE all + INSERT fresh):
 *   1. DELETE all existing junction rows for this collection
 *   2. INSERT the fresh set of offer IDs
 *
 * This is idempotent — duplicate webhook deliveries produce the same DB state.
 *
 * ## Pagination
 * Both `/offers` and `/offers/ids` use the same pagination envelope:
 * 1-based (page=1 default), size=20 default, paginated via {content[], last}.
 * We fetch all pages (size=100) before writing to DB.
 *
 * @see https://docs.violet.io/prism/webhooks/events/collection-webhooks
 * @see https://docs.violet.io/api-reference/catalog/collections/get-collection-offers-ids
 */
export async function processCollectionOffersUpdated(
  _supabase: SupabaseClient,
  eventId: string,
  payload: VioletCollectionPayload,
): Promise<void> {
  console.log(
    `[collection] Collection offers updated (no-op): id=${payload.id} merchant=${payload.merchant_id} — fetched directly from Violet API`,
  );
  await updateEventStatus(_supabase, eventId, "processed");
}

// ─── Merchant Feature Flag Auto-Enable ──────────────────────────────────

/**
 * Automatically enables Violet feature flags for a newly connected merchant.
 *
 * Per the Violet docs, these flags must be toggled per-merchant via
 * PUT /merchants/{merchant_id}/configuration/global_feature_flags/{flag_name}
 *
 * Flags enabled:
 * - sync_collections: daily collection sync + COLLECTION_* webhooks (Shopify)
 * - sync_metadata: Offer-level metadata from Shopify metafields
 * - sync_sku_metadata: SKU-level metadata (variant enrichments)
 *
 * Failures are logged but non-blocking — the merchant connection succeeds
 * regardless. Flags can be re-toggled manually if needed.
 *
 * @see https://docs.violet.io/prism/catalog/collections
 * @see https://docs.violet.io/prism/catalog/metadata-syncing
 * @see https://docs.violet.io/prism/catalog/metadata-syncing/sku-metadata
 */
async function autoEnableMerchantFlags(merchantId: string): Promise<void> {
  const flags = ["sync_collections", "sync_metadata", "sync_sku_metadata", "contextual_pricing"];
  const apiBase = Deno.env.get("VIOLET_API_BASE") ?? "https://sandbox-api.violet.io/v1";

  for (const flag of flags) {
    try {
      const url = `${apiBase}/merchants/${merchantId}/configuration/global_feature_flags/${flag}`;
      const res = await violetFetch(url, {
        method: "PUT",
        body: JSON.stringify({ enabled: true }),
      });

      if (res.ok) {
        console.log(`[merchant] Enabled flag ${flag} for merchant ${merchantId}`);
      } else {
        const text = await res.text().catch(() => "");
        console.warn(
          `[merchant] Failed to enable ${flag} for merchant ${merchantId}: ${res.status} ${text}`,
        );
      }
    } catch (err) {
      console.warn(
        `[merchant] Error enabling ${flag} for merchant ${merchantId}: ${
          err instanceof Error ? err.message : "Unknown"
        }`,
      );
    }
  }
}
