/**
 * Edge Function: handle-webhook
 *
 * Receives inbound Violet.io webhook events (server-to-server) and processes them.
 * This is the single entry point for ALL Violet webhook events — product catalog
 * (Epic 3), order lifecycle, and bag fulfillment (Epic 5).
 *
 * ## Request flow
 *
 * ```
 * 1. CORS preflight (OPTIONS) — kept for consistency with other Edge Functions
 * 2. POST only — reject other methods with 405
 * 3. Read raw body as text (HMAC must validate raw string, not parsed JSON)
 * 4. Extract + validate webhook headers via Zod (two-phase validation)
 *    Phase 1: Structural validation (hmac, eventId, eventType as strings)
 *    Phase 2: eventType enum check — unknown types get 200 + log (not 400)
 * 5. Validate HMAC-SHA256 signature → 401 if invalid (ONLY non-2xx case)
 * 6. Idempotency check: SELECT webhook_events WHERE event_id = ? → 200 if exists
 * 7. INSERT webhook_events (status: received) — claims the event via UNIQUE constraint
 *    Race condition: concurrent INSERT hits unique violation → 200 (already claimed)
 * 8. Parse JSON body → validate with event-specific Zod schema
 * 9. Route to processor (processOrderUpdated, processBagShipped, etc.)
 * 10. Return 200 to Violet after processing completes
 * ```
 *
 * ## Violet webhook event types handled
 *
 * | Event Type          | Processor                | Action                                    |
 * |---------------------|--------------------------|-------------------------------------------|
 * | OFFER_ADDED         | processOfferAdded        | Generate product embedding for AI search  |
 * | OFFER_UPDATED       | processOfferUpdated      | Re-generate embedding with new data       |
 * | OFFER_REMOVED       | processOfferRemoved      | Soft-delete (available=false)             |
 * | OFFER_DELETED       | processOfferDeleted      | Soft-delete (available=false)             |
 * | PRODUCT_SYNC_*      | processSyncEvent         | Audit trail only                          |
 * | ORDER_UPDATED       | processOrderUpdated      | Update orders.status                      |
 * | ORDER_COMPLETED     | processOrderUpdated      | Update orders.status                      |
 * | ORDER_CANCELED      | processOrderUpdated      | Update orders.status                      |
 * | ORDER_REFUNDED      | processOrderUpdated      | Update orders.status                      |
 * | ORDER_RETURNED      | processOrderUpdated      | Update orders.status                      |
 * | BAG_SUBMITTED       | processBagUpdated        | Update bag status + derive order status   |
 * | BAG_ACCEPTED        | processBagUpdated        | Update bag status + derive order status   |
 * | BAG_SHIPPED         | processBagShipped        | Persist tracking info + notification      |
 * | BAG_COMPLETED       | processBagUpdated        | Update bag status + delivery notification |
 * | BAG_CANCELED        | processBagUpdated        | Update bag status + derive order status   |
 * | BAG_REFUNDED        | processBagRefunded       | Fetch refund details + notification       |
 * | MERCHANT_CONNECTED  | processMerchantConnected | Log connection + audit trail              |
 * | MERCHANT_DISCONNECTED | processMerchantDisconnected | Log disconnection                       |
 * | MERCHANT_ENABLED    | processMerchantStatusChange | Log enable/disable + audit trail        |
 * | MERCHANT_DISABLED   | processMerchantStatusChange | Log enable/disable + audit trail        |
 * | COLLECTION_CREATED  | processCollectionCreated   | Insert collection into DB                |
 * | COLLECTION_UPDATED  | processCollectionUpdated   | Update collection metadata in DB         |
 * | COLLECTION_REMOVED  | processCollectionRemoved   | Soft-delete collection + clear junction   |
 * | COLLECTION_OFFERS_UPDATED | processCollectionOffersUpdated | Log offer composition change       |
 * | TRANSFER_SENT            | processTransferSent                | Persist transfer success               |
 * | TRANSFER_FAILED          | processTransferFailed              | Log failure + error details            |
 * | TRANSFER_REVERSED        | processTransferReversed            | Persist full reversal                   |
 * | TRANSFER_PARTIALLY_REVERSED | processTransferPartiallyReversed | Persist partial reversal              |
 * | MERCHANT_PAYOUT_ACCOUNT_CREATED | processPayoutAccountCreated | Persist PPA + KYC alerts               |
 * | MERCHANT_PAYOUT_ACCOUNT_REQUIREMENTS_UPDATED | processPayoutAccountRequirementsUpdated | Update PPA + KYC alerts |
 * | MERCHANT_PAYOUT_ACCOUNT_DELETED | processPayoutAccountDeleted | Soft-delete PPA + audit log  |
 * | MERCHANT_PAYOUT_ACCOUNT_ACTIVATED | processPayoutAccountActivated | Upsert PPA active + deactivate others |
 * | MERCHANT_PAYOUT_ACCOUNT_DEACTIVATED | processPayoutAccountDeactivated | Upsert PPA inactive + audit log |
 *
 * ## ⚠️ KNOWN LIMITATION: Synchronous processing (H1 code review)
 *
 * Supabase Edge Functions (Deno) do NOT support `waitUntil()` or background
 * tasks. The entire flow — including `supabase.functions.invoke("generate-embeddings")`
 * which calls OpenAI — runs synchronously before the 200 response is sent.
 *
 * **Risk:** If OpenAI is slow (>5s), total processing may exceed Violet's 10s
 * expectation, triggering retries. Mitigations:
 * - The event is claimed in DB (step 7) before processing, so retries hit the
 *   idempotency check and return 200 instantly.
 * - If the function times out mid-processing, the event stays in "received"
 *   status and can be retried manually or via a cleanup cron.
 * - For true async, migrate to Supabase Queues or pg_cron + DB-driven processing.
 *
 * ## Idempotency mechanism
 *
 * Violet may deliver the same event multiple times (up to 10 retries over 24h
 * with exponential backoff). Deduplication works at two levels:
 * 1. **SELECT check**: Fast path — if event_id exists in webhook_events, return 200
 * 2. **INSERT with UNIQUE constraint**: Race condition guard — if two concurrent
 *    requests pass the SELECT check, the second INSERT fails with code 23505
 *    (unique violation) and returns 200
 *
 * ## Authentication: HMAC, not service_role
 *
 * Violet doesn't send Supabase JWTs. Authentication is via HMAC-SHA256 signature
 * of the raw body using VIOLET_APP_SECRET as key. DO NOT use isServiceRole() here.
 *
 * ## Error handling: Always return 2xx (except HMAC failure)
 *
 * Violet retries on non-2xx and will disable the webhook after 50+ failures
 * within 30 minutes (temporary 1h/3h/24h suspensions, then permanent disable).
 * Even if processing fails, return 200 and log the error to webhook_events.
 * Only HMAC failure returns 401 (to signal a configuration problem to Violet).
 *
 * @module handle-webhook
 * @see https://docs.violet.io/prism/webhooks/handling-webhooks — Retry policy & best practices
 * @see https://docs.violet.io/prism/webhooks/events/order-webhooks — Order event reference
 * @see webhookAuth.ts — HMAC signature verification
 * @see processors.ts — Offer/sync event processors
 * @see orderProcessors.ts — Order/bag event processors
 */

import { corsHeaders } from "../_shared/cors.ts";
import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { validateHmac, extractWebhookHeaders } from "../_shared/webhookAuth.ts";
import {
  violetWebhookHeadersSchema,
  violetRequiredHeadersSchema,
  webhookEventTypeSchema,
  violetOfferWebhookPayloadSchema,
  violetSyncWebhookPayloadSchema,
  violetOrderWebhookPayloadSchema,
  violetBagWebhookPayloadSchema,
  violetMerchantWebhookPayloadSchema,
  violetCollectionWebhookPayloadSchema,
  violetTransferWebhookPayloadSchema,
  violetPayoutAccountWebhookPayloadSchema,
} from "../_shared/schemas.ts";
import {
  processOfferAdded,
  processOfferUpdated,
  processOfferRemoved,
  processOfferDeleted,
  processSyncEvent,
  processMerchantConnected,
  processMerchantDisconnected,
  processMerchantStatusChange,
  processCollectionCreated,
  processCollectionUpdated,
  processCollectionRemoved,
  processCollectionOffersUpdated,
  updateEventStatus,
} from "./processors.ts";
import {
  processOrderUpdated,
  processBagUpdated,
  processBagShipped,
  processBagRefunded,
} from "./orderProcessors.ts";
import {
  processTransferSent,
  processTransferFailed,
  processTransferReversed,
  processTransferPartiallyReversed,
} from "./transferProcessors.ts";
import {
  processPayoutAccountCreated,
  processPayoutAccountRequirementsUpdated,
  processPayoutAccountDeleted,
  processPayoutAccountActivated,
  processPayoutAccountDeactivated,
} from "./payoutAccountProcessors.ts";

/** Standard JSON response headers for all responses. */
const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

Deno.serve(async (req: Request) => {
  // ─── CORS preflight ──────────────────────────────────────────────
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // ─── Only accept POST ────────────────────────────────────────────
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({
        data: null,
        error: { code: "WEBHOOK.METHOD_NOT_ALLOWED", message: "POST only" },
      }),
      { status: 405, headers: jsonHeaders },
    );
  }

  // ─── Read raw body BEFORE parsing (needed for HMAC validation) ───
  const rawBody = await req.text();

  // ─── Extract and validate webhook headers ────────────────────────
  /**
   * H2 code review fix — Two-phase header validation.
   *
   * Phase 1: Validate required transport headers (hmac, eventId, raw eventType string).
   * These are structural requirements — if missing, the request is malformed and
   * returning 400 is appropriate (Violet won't fix this by retrying).
   *
   * Phase 2: Validate eventType against our known enum SEPARATELY.
   * If the event type is unknown (e.g., ORDER_UPDATED before Story 5.2 is deployed,
   * or a new Violet event type we haven't implemented yet), we return 200 and log it
   * as "skipped". This prevents Violet from retrying unknown events and potentially
   * disabling our webhook endpoint after 50+ failures in 30 minutes.
   *
   * Previously, eventType was validated inside violetWebhookHeadersSchema, so ANY
   * unknown event type caused a 400 response — a ticking time bomb for when Story 5.2
   * ORDER_* events start arriving at this endpoint before the handler code is deployed.
   *
   * @see https://docs.violet.io/prism/webhooks/handling-webhooks — Retry/disable policy
   */
  const rawHeaders = extractWebhookHeaders(req);

  // Phase 1: Validate required headers (hmac + eventId + eventType as non-empty string)
  const requiredResult = violetRequiredHeadersSchema.safeParse(rawHeaders);

  if (!requiredResult.success) {
    return new Response(
      JSON.stringify({
        data: null,
        error: {
          code: "WEBHOOK.INVALID_HEADERS",
          message: requiredResult.error.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; "),
        },
      }),
      { status: 400, headers: jsonHeaders },
    );
  }

  const { hmac, eventId, eventType: rawEventType } = requiredResult.data;

  // Phase 2: Check if eventType is one we handle — if not, accept gracefully
  const eventTypeParsed = webhookEventTypeSchema.safeParse(rawEventType);
  if (!eventTypeParsed.success) {
    // Unknown event type — log for visibility but return 200 to prevent Violet retries.
    // This will happen when Violet sends ORDER_* events (Story 5.2) or any new event
    // type before we add handler code. The event is NOT stored in webhook_events because
    // we have no processor for it — it's purely informational logging.
    console.warn(
      `[handle-webhook] Unknown event type "${rawEventType}" from event ${eventId} — returning 200 (no handler). ` +
        `Add this type to webhookEventTypeSchema when a processor is implemented.`,
    );
    return new Response(
      JSON.stringify({
        data: { message: `Event type "${rawEventType}" not handled — acknowledged` },
        error: null,
      }),
      { status: 200, headers: jsonHeaders },
    );
  }

  const eventType = eventTypeParsed.data;

  // ─── Validate HMAC signature ─────────────────────────────────────
  // This is the ONLY case where we return non-2xx to Violet.
  // A failed HMAC means either our secret is wrong or the request is forged.
  try {
    const isValid = await validateHmac(rawBody, hmac);
    if (!isValid) {
      return new Response(
        JSON.stringify({
          data: null,
          error: { code: "WEBHOOK.HMAC_INVALID", message: "Invalid signature" },
        }),
        { status: 401, headers: jsonHeaders },
      );
    }
  } catch (err) {
    // Missing VIOLET_APP_SECRET or crypto failure — still 401 to signal config issue
    return new Response(
      JSON.stringify({
        data: null,
        error: {
          code: "WEBHOOK.HMAC_ERROR",
          message: err instanceof Error ? err.message : "HMAC validation error",
        },
      }),
      { status: 401, headers: jsonHeaders },
    );
  }

  const supabase = getSupabaseAdmin();

  // ─── Idempotency check ──────────────────────────────────────────
  // If this event_id was already received, skip processing (duplicate delivery).
  const { data: existingEvent } = await supabase
    .from("webhook_events")
    .select("id")
    .eq("event_id", eventId)
    .maybeSingle();

  if (existingEvent) {
    return new Response(
      JSON.stringify({ data: { message: "Event already processed" }, error: null }),
      { status: 200, headers: jsonHeaders },
    );
  }

  // ─── Parse payload ──────────────────────────────────────────────
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    // Malformed JSON — log and return 200 (don't trigger Violet retries for bad data)
    await supabase.from("webhook_events").insert({
      event_id: eventId,
      event_type: eventType,
      entity_id: "unknown",
      status: "failed",
      payload: null,
      error_message: "Malformed JSON body",
      processed_at: new Date().toISOString(),
    });

    return new Response(
      JSON.stringify({ data: { message: "Received (malformed payload)" }, error: null }),
      { status: 200, headers: jsonHeaders },
    );
  }

  // ─── Determine entity_id from payload ───────────────────────────
  const entityId = String((payload as Record<string, unknown>)?.id ?? "unknown");

  // ─── Insert webhook_events row (status: received) — claims the event ─
  const { error: insertError } = await supabase.from("webhook_events").insert({
    event_id: eventId,
    event_type: eventType,
    entity_id: entityId,
    status: "received",
    payload,
  });

  if (insertError) {
    // Unique constraint violation = race condition (another instance already claimed)
    if (insertError.code === "23505") {
      return new Response(
        JSON.stringify({ data: { message: "Event already processed" }, error: null }),
        { status: 200, headers: jsonHeaders },
      );
    }
    // Other DB error — return 200 anyway to not trigger Violet retries
    console.error("Failed to insert webhook_events:", insertError.message);
    return new Response(JSON.stringify({ data: { message: "Received" }, error: null }), {
      status: 200,
      headers: jsonHeaders,
    });
  }

  // ─── Process event inline (see H1 limitation in module JSDoc) ───
  // Processing runs synchronously before the 200 response. The event is
  // already claimed in DB — if the function times out here, the event
  // stays "received" and idempotency prevents duplicate processing on retry.

  // ─── Route to event-specific processor ──────────────────────────
  try {
    switch (eventType) {
      case "OFFER_ADDED": {
        const result = violetOfferWebhookPayloadSchema.safeParse(payload);
        if (!result.success) {
          await updateEventStatus(
            supabase,
            eventId,
            "failed",
            `Zod validation failed: ${result.error.message}`,
          );
          break;
        }
        await processOfferAdded(supabase, eventId, result.data);
        break;
      }

      case "OFFER_UPDATED": {
        const result = violetOfferWebhookPayloadSchema.safeParse(payload);
        if (!result.success) {
          await updateEventStatus(
            supabase,
            eventId,
            "failed",
            `Zod validation failed: ${result.error.message}`,
          );
          break;
        }
        await processOfferUpdated(supabase, eventId, result.data);
        break;
      }

      case "OFFER_REMOVED": {
        const result = violetOfferWebhookPayloadSchema.safeParse(payload);
        if (!result.success) {
          await updateEventStatus(
            supabase,
            eventId,
            "failed",
            `Zod validation failed: ${result.error.message}`,
          );
          break;
        }
        await processOfferRemoved(supabase, eventId, result.data);
        break;
      }

      case "OFFER_DELETED": {
        const result = violetOfferWebhookPayloadSchema.safeParse(payload);
        if (!result.success) {
          await updateEventStatus(
            supabase,
            eventId,
            "failed",
            `Zod validation failed: ${result.error.message}`,
          );
          break;
        }
        await processOfferDeleted(supabase, eventId, result.data);
        break;
      }

      case "PRODUCT_SYNC_STARTED":
      case "PRODUCT_SYNC_COMPLETED":
      case "PRODUCT_SYNC_FAILED": {
        const result = violetSyncWebhookPayloadSchema.safeParse(payload);
        if (!result.success) {
          await updateEventStatus(
            supabase,
            eventId,
            "failed",
            `Zod validation failed: ${result.error.message}`,
          );
          break;
        }
        await processSyncEvent(supabase, eventId, result.data);
        break;
      }

      // ─── MERCHANT events ────────────────────────────────────
      case "MERCHANT_CONNECTED": {
        const result = violetMerchantWebhookPayloadSchema.safeParse(payload);
        if (!result.success) {
          await updateEventStatus(
            supabase,
            eventId,
            "failed",
            `Zod validation failed: ${result.error.message}`,
          );
          break;
        }
        await processMerchantConnected(supabase, eventId, result.data);
        break;
      }

      case "MERCHANT_DISCONNECTED": {
        const result = violetMerchantWebhookPayloadSchema.safeParse(payload);
        if (!result.success) {
          await updateEventStatus(
            supabase,
            eventId,
            "failed",
            `Zod validation failed: ${result.error.message}`,
          );
          break;
        }
        await processMerchantDisconnected(supabase, eventId, result.data);
        break;
      }

      case "MERCHANT_ENABLED":
      case "MERCHANT_DISABLED": {
        const result = violetMerchantWebhookPayloadSchema.safeParse(payload);
        if (!result.success) {
          await updateEventStatus(
            supabase,
            eventId,
            "failed",
            `Zod validation failed: ${result.error.message}`,
          );
          break;
        }
        await processMerchantStatusChange(supabase, eventId, eventType, result.data);
        break;
      }

      // ─── COLLECTION events ────────────────────────────────────
      // Requires `sync_collections` feature flag enabled per merchant.
      case "COLLECTION_CREATED": {
        const result = violetCollectionWebhookPayloadSchema.safeParse(payload);
        if (!result.success) {
          await updateEventStatus(
            supabase,
            eventId,
            "failed",
            `Zod validation failed: ${result.error.message}`,
          );
          break;
        }
        await processCollectionCreated(supabase, eventId, result.data);
        break;
      }

      case "COLLECTION_UPDATED": {
        const result = violetCollectionWebhookPayloadSchema.safeParse(payload);
        if (!result.success) {
          await updateEventStatus(
            supabase,
            eventId,
            "failed",
            `Zod validation failed: ${result.error.message}`,
          );
          break;
        }
        await processCollectionUpdated(supabase, eventId, result.data);
        break;
      }

      case "COLLECTION_REMOVED": {
        const result = violetCollectionWebhookPayloadSchema.safeParse(payload);
        if (!result.success) {
          await updateEventStatus(
            supabase,
            eventId,
            "failed",
            `Zod validation failed: ${result.error.message}`,
          );
          break;
        }
        await processCollectionRemoved(supabase, eventId, result.data);
        break;
      }

      case "COLLECTION_OFFERS_UPDATED": {
        const result = violetCollectionWebhookPayloadSchema.safeParse(payload);
        if (!result.success) {
          await updateEventStatus(
            supabase,
            eventId,
            "failed",
            `Zod validation failed: ${result.error.message}`,
          );
          break;
        }
        await processCollectionOffersUpdated(supabase, eventId, result.data);
        break;
      }

      // ─── ORDER events (Story 5.2) ────────────────────────────
      // All ORDER_* events delegate to processOrderUpdated (Violet sends final status).
      case "ORDER_UPDATED":
      case "ORDER_COMPLETED":
      case "ORDER_CANCELED":
      case "ORDER_REFUNDED":
      case "ORDER_RETURNED": {
        const result = violetOrderWebhookPayloadSchema.safeParse(payload);
        if (!result.success) {
          await updateEventStatus(
            supabase,
            eventId,
            "failed",
            `Zod validation failed: ${result.error.message}`,
          );
          break;
        }
        await processOrderUpdated(supabase, eventId, result.data);
        break;
      }

      // ─── BAG events (Story 5.2) ──────────────────────────────
      // BAG_SHIPPED is separate — it persists tracking info (tracking_number, url, carrier).
      case "BAG_SHIPPED": {
        const result = violetBagWebhookPayloadSchema.safeParse(payload);
        if (!result.success) {
          await updateEventStatus(
            supabase,
            eventId,
            "failed",
            `Zod validation failed: ${result.error.message}`,
          );
          break;
        }
        await processBagShipped(supabase, eventId, result.data);
        break;
      }

      // All other BAG_* events use generic bag status update + order derivation.
      case "BAG_SUBMITTED":
      case "BAG_ACCEPTED":
      case "BAG_COMPLETED":
      case "BAG_CANCELED": {
        const result = violetBagWebhookPayloadSchema.safeParse(payload);
        if (!result.success) {
          await updateEventStatus(
            supabase,
            eventId,
            "failed",
            `Zod validation failed: ${result.error.message}`,
          );
          break;
        }
        await processBagUpdated(supabase, eventId, result.data);
        break;
      }

      // BAG_REFUNDED — dedicated processor: fetches refund details from Violet API
      // and stores them in order_refunds, then fires send-notification (Story 5.6).
      case "BAG_REFUNDED": {
        const result = violetBagWebhookPayloadSchema.safeParse(payload);
        if (!result.success) {
          await updateEventStatus(
            supabase,
            eventId,
            "failed",
            `Zod validation failed: ${result.error.message}`,
          );
          break;
        }
        await processBagRefunded(supabase, eventId, result.data);
        break;
      }

      // ─── Transfer Events ────────────────────────────────────────────────
      // Fund movement tracking: sent, failed, reversed.
      // Critical for monitoring failed merchant payouts and triggering retries.
      // @see https://docs.violet.io/prism/payments/payments-during-checkout/guides/handling-failed-transfers

      case "TRANSFER_SENT": {
        const result = violetTransferWebhookPayloadSchema.safeParse(payload);
        if (!result.success) {
          await updateEventStatus(
            supabase,
            eventId,
            "failed",
            `Zod validation failed: ${result.error.message}`,
          );
          break;
        }
        await processTransferSent(supabase, eventId, result.data);
        break;
      }

      case "TRANSFER_FAILED": {
        const result = violetTransferWebhookPayloadSchema.safeParse(payload);
        if (!result.success) {
          await updateEventStatus(
            supabase,
            eventId,
            "failed",
            `Zod validation failed: ${result.error.message}`,
          );
          break;
        }
        await processTransferFailed(supabase, eventId, result.data);
        break;
      }

      case "TRANSFER_REVERSED": {
        const result = violetTransferWebhookPayloadSchema.safeParse(payload);
        if (!result.success) {
          await updateEventStatus(
            supabase,
            eventId,
            "failed",
            `Zod validation failed: ${result.error.message}`,
          );
          break;
        }
        await processTransferReversed(supabase, eventId, result.data);
        break;
      }

      case "TRANSFER_PARTIALLY_REVERSED": {
        const result = violetTransferWebhookPayloadSchema.safeParse(payload);
        if (!result.success) {
          await updateEventStatus(
            supabase,
            eventId,
            "failed",
            `Zod validation failed: ${result.error.message}`,
          );
          break;
        }
        await processTransferPartiallyReversed(supabase, eventId, result.data);
        break;
      }

      // ─── Payout Account Events ──────────────────────────────────────────
      // Prism Pay Account lifecycle: creation and KYC requirements updates.
      // Critical for proactive monitoring of merchant payout readiness.
      // @see https://docs.violet.io/prism/payments/payouts/prism-payout-accounts

      case "MERCHANT_PAYOUT_ACCOUNT_CREATED": {
        const result = violetPayoutAccountWebhookPayloadSchema.safeParse(payload);
        if (!result.success) {
          await updateEventStatus(
            supabase,
            eventId,
            "failed",
            `Zod validation failed: ${result.error.message}`,
          );
          break;
        }
        await processPayoutAccountCreated(supabase, eventId, result.data);
        break;
      }

      case "MERCHANT_PAYOUT_ACCOUNT_REQUIREMENTS_UPDATED": {
        const result = violetPayoutAccountWebhookPayloadSchema.safeParse(payload);
        if (!result.success) {
          await updateEventStatus(
            supabase,
            eventId,
            "failed",
            `Zod validation failed: ${result.error.message}`,
          );
          break;
        }
        await processPayoutAccountRequirementsUpdated(supabase, eventId, result.data);
        break;
      }

      case "MERCHANT_PAYOUT_ACCOUNT_DELETED": {
        // Minimal payload: just { "id": number }
        const ppaId = (payload as Record<string, unknown>)?.id;
        if (typeof ppaId !== "number") {
          await updateEventStatus(
            supabase,
            eventId,
            "failed",
            "Missing or invalid id in MERCHANT_PAYOUT_ACCOUNT_DELETED payload",
          );
          break;
        }
        await processPayoutAccountDeleted(supabase, eventId, { id: ppaId });
        break;
      }

      case "MERCHANT_PAYOUT_ACCOUNT_ACTIVATED": {
        const result = violetPayoutAccountWebhookPayloadSchema.safeParse(payload);
        if (!result.success) {
          await updateEventStatus(
            supabase,
            eventId,
            "failed",
            `Zod validation failed: ${result.error.message}`,
          );
          break;
        }
        await processPayoutAccountActivated(supabase, eventId, result.data);
        break;
      }

      case "MERCHANT_PAYOUT_ACCOUNT_DEACTIVATED": {
        const result = violetPayoutAccountWebhookPayloadSchema.safeParse(payload);
        if (!result.success) {
          await updateEventStatus(
            supabase,
            eventId,
            "failed",
            `Zod validation failed: ${result.error.message}`,
          );
          break;
        }
        await processPayoutAccountDeactivated(supabase, eventId, result.data);
        break;
      }

      default:
        // Unknown event type that passed Zod enum — should never happen, but log it
        await updateEventStatus(supabase, eventId, "failed", `Unhandled event type: ${eventType}`);
    }
  } catch (err) {
    // Catch-all for unexpected processor errors — mark failed, don't crash
    const message = err instanceof Error ? err.message : "Unknown processing error";
    await updateEventStatus(supabase, eventId, "failed", message);
  }

  return new Response(JSON.stringify({ data: { message: "Received" }, error: null }), {
    status: 200,
    headers: jsonHeaders,
  });
});
