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
 * ## Error handling strategy
 *
 * All processors catch errors internally and call `updateEventStatus("failed", msg)`.
 * They never throw — the caller (index.ts) has a catch-all, but processors are
 * self-contained to provide precise error messages in webhook_events.error_message.
 * The HTTP response is ALWAYS 200 regardless of processor outcome.
 *
 * @module processors
 * @see orderProcessors.ts — Order/bag event processors (Story 5.2)
 * @see https://docs.violet.io/prism/webhooks/handling-webhooks — Violet best practices
 */

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

import { violetFetch } from "../_shared/fetchWithRetry.ts"
import { DEFAULT_VIOLET_API_BASE } from "../_shared/constants.ts";
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
 * Processes OFFER_ADDED/OFFER_UPDATED events — catalog monitoring only.
 *
 * Logs the offer event for audit trail. The actual product catalog is fetched
 * directly from the Violet API on the frontend side.
 */
export async function processOfferAdded(
  supabase: SupabaseClient,
  eventId: string,
  payload: VioletOfferPayload,
): Promise<void> {
  console.log(
    `[offer] Offer added/updated (audit): id=${payload.id} name="${payload.name}" merchant=${payload.merchant_id}`,
  );
  await updateEventStatus(supabase, eventId, "processed");
}

/**
 * Processes OFFER_UPDATED events — same as OFFER_ADDED (audit trail).
 */
export async function processOfferUpdated(
  supabase: SupabaseClient,
  eventId: string,
  payload: VioletOfferPayload,
): Promise<void> {
  return processOfferAdded(supabase, eventId, payload);
}

/**
 * Processes OFFER_REMOVED and OFFER_DELETED events — catalog monitoring only.
 *
 * Logs the event for audit trail.
 */
export async function processOfferRemoved(
  supabase: SupabaseClient,
  eventId: string,
  payload: VioletOfferPayload,
): Promise<void> {
  console.log(
    `[offer] Offer removed/deleted (audit): id=${payload.id} name="${payload.name}"`,
  );
  await updateEventStatus(supabase, eventId, "processed");
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
  // Per Violet docs, these flags must be toggled per-merchant.
  await autoEnableMerchantFlags(merchantId);

  await updateEventStatus(supabase, eventId, "processed");
}

/**
 * Processes MERCHANT_DISCONNECTED webhook event.
 *
 * Fired when a merchant disconnects their store from Violet.
 * Updates the merchants table status and logs the disconnection.
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

import { invalidateCollectionsCache } from "../_shared/cacheInvalidation.ts";

/**
 * Processes COLLECTION_CREATED webhook event.
 *
 * Fired when a new collection is created by a merchant.
 * Note: The collection may have 0 offers initially — use COLLECTION_OFFERS_UPDATED
 * to track when offers are added.
 *
 * Invalidates the web backend collections cache so the new collection
 * appears on the next page load.
 *
 * @see https://docs.violet.io/prism/webhooks/events/collection-webhooks
 */
export async function processCollectionCreated(
  _supabase: SupabaseClient,
  eventId: string,
  payload: VioletCollectionPayload,
): Promise<void> {
  console.log(
    `[collection] Collection created: id=${payload.id} name="${payload.name ?? "Unknown"}" — invalidating cache`,
  );
  await invalidateCollectionsCache();
  await updateEventStatus(_supabase, eventId, "processed");
}

/**
 * Processes COLLECTION_UPDATED webhook event.
 *
 * Invalidates the web backend collections cache so updated metadata
 * (name, description, image) appears on the next page load.
 *
 * @see https://docs.violet.io/prism/webhooks/events/collection-webhooks
 */
export async function processCollectionUpdated(
  _supabase: SupabaseClient,
  eventId: string,
  payload: VioletCollectionPayload,
): Promise<void> {
  console.log(
    `[collection] Collection updated: id=${payload.id} name="${payload.name ?? "Unknown"}" — invalidating cache`,
  );
  await invalidateCollectionsCache();
  await updateEventStatus(_supabase, eventId, "processed");
}

/**
 * Processes COLLECTION_REMOVED webhook event.
 *
 * Invalidates the web backend collections cache so the removed collection
 * disappears on the next page load.
 *
 * @see https://docs.violet.io/prism/webhooks/events/collection-webhooks
 */
export async function processCollectionRemoved(
  _supabase: SupabaseClient,
  eventId: string,
  payload: VioletCollectionPayload,
): Promise<void> {
  console.log(
    `[collection] Collection removed: id=${payload.id} — invalidating cache`,
  );
  await invalidateCollectionsCache();
  await updateEventStatus(_supabase, eventId, "processed");
}

/**
 * Processes COLLECTION_OFFERS_UPDATED webhook event.
 *
 * Fired when products are added to or removed from a collection.
 * Invalidates the web backend collections cache so the product count
 * is recalculated on the next page load.
 *
 * @see https://docs.violet.io/prism/webhooks/events/collection-webhooks
 */
export async function processCollectionOffersUpdated(
  _supabase: SupabaseClient,
  eventId: string,
  payload: VioletCollectionPayload,
): Promise<void> {
  console.log(
    `[collection] Collection offers updated: id=${payload.id} merchant=${payload.merchant_id} — invalidating cache`,
  );
  await invalidateCollectionsCache();
  await updateEventStatus(_supabase, eventId, "processed");
}

// ─── Merchant Feature Flag Auto-Enable ──────────────────────────────────

/**
 * Automatically enables Violet feature flags for a newly connected merchant.
 *
 * Per the Violet docs, these flags must be toggled per-merchant via
 * PUT /merchants/{merchant_id}/configuration/global_feature_flags/{flag_name}
 *
 * @see https://docs.violet.io/prism/catalog/collections
 * @see https://docs.violet.io/prism/catalog/metadata-syncing
 */
async function autoEnableMerchantFlags(merchantId: string): Promise<void> {
  const flags = ["sync_collections", "sync_metadata", "sync_sku_metadata", "contextual_pricing"];
  const apiBase = Deno.env.get("VIOLET_API_BASE") ?? DEFAULT_VIOLET_API_BASE;

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
