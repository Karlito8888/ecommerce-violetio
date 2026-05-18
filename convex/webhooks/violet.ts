// convex/webhooks/violet.ts
//
// Convex webhook handler for Violet.io events.
// Replaces supabase/functions/handle-webhook/ (7 files, Deno Edge Function).
//
// Architecture:
//   Violet → POST /api/webhooks/violet (Convex HTTP Action)
//     → Validate HMAC signature
//     → Idempotency check (webhookEvents table)
//     → Route to internal mutation (processEvent)
//     → Fire-and-forget actions (emails, push) via scheduler
//
// Key differences from the Supabase Edge Function:
//   1. Convex mutations are ACID transactions — no race conditions on idempotency
//   2. Internal mutations provide clean separation: HTTP action → mutation → DB writes
//   3. ctx.scheduler.runAfter() replaces fire-and-forget promises for async work
//   4. process.env works in actions (not Deno.env.get)
//   5. crypto.subtle is available globally (Web Crypto API)
//
// Doc: https://docs.convex.dev/functions/http-actions
// Doc: https://docs.violet.io/prism/webhooks/handling-webhooks

import { httpAction, internalMutation, internalAction, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { GenericMutationCtx } from "convex/server";
import { escapeHtml, sendRawEmail } from "../lib/email";
import {
  violetOrderPayloadSchema,
  violetBagPayloadSchema,
  violetMerchantPayloadSchema,
  violetTransferPayloadSchema,
  violetPayoutAccountPayloadSchema,
  violetOfferPayloadSchema,
  violetSyncPayloadSchema,
  violetCollectionPayloadSchema,
  violetPaymentTransactionPayloadSchema,
} from "../lib/webhookSchemas";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MutationCtx = GenericMutationCtx<any>;

// ─── HMAC Validation ────────────────────────────────────────────────────────

const encoder = new TextEncoder();

/**
 * Validates a Violet webhook HMAC-SHA256 signature.
 * Uses crypto.subtle.verify() for constant-time comparison (prevents timing attacks).
 *
 * Algorithm: Base64(HMAC-SHA256(VIOLET_APP_SECRET, rawRequestBody))
 */
async function validateHmac(rawBody: string, hmacHeader: string): Promise<boolean> {
  const secret = process.env.VIOLET_APP_SECRET;
  if (!secret) {
    throw new Error("Missing VIOLET_APP_SECRET environment variable");
  }

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );

  const signatureBytes = Uint8Array.from(atob(hmacHeader), (c) => c.charCodeAt(0));
  return crypto.subtle.verify("HMAC", key, signatureBytes, encoder.encode(rawBody));
}

// ─── Internal Query — Idempotency Check ──────────────────────────────────────

export const checkEvent = internalQuery({
  args: { eventId: v.string() },
  handler: async (ctx, { eventId }) => {
    const existing = await ctx.db
      .query("webhookEvents")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
      .first();
    return existing?._id ?? null;
  },
});

// ─── HTTP Action — Webhook Endpoint ─────────────────────────────────────────

/**
 * HTTP Action: POST /api/webhooks/violet
 *
 * Receives Violet webhook events. This is the single entry point for ALL
 * Violet webhook events — orders, bags, merchants, transfers, payouts, etc.
 *
 * Flow:
 *   1. Read raw body (HMAC validates raw string, not parsed JSON)
 *   2. Extract + validate webhook headers (two-phase)
 *   3. Validate HMAC-SHA256 signature → 401 if invalid (only non-2xx case)
 *   4. Idempotency check via internal query
 *   5. Parse JSON body → extract entityId
 *   6. Insert webhookEvents row (status: received) — claims the event
 *   7. Route to internal mutation for processing
 *   8. Return 200 to Violet
 *
 * Error handling: Always return 2xx (except HMAC failure).
 * Violet retries on non-2xx and disables after 50+ failures in 30 min.
 */
export const handleVioletWebhook = httpAction(async (ctx, request) => {
  // ─── Only accept POST ────────────────────────────────────────────
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST only" }), { status: 405 });
  }

  // ─── Read raw body BEFORE parsing (needed for HMAC validation) ───
  const rawBody = await request.text();

  // ─── Phase 1: Validate required transport headers ────────────────
  const hmac = request.headers.get("x-violet-hmac") ?? "";
  const eventId = request.headers.get("x-violet-event-id") ?? "";
  const eventType = request.headers.get("x-violet-topic") ?? "";
  const reason = request.headers.get("x-violet-reason") ?? undefined;

  if (!hmac || !eventId || !eventType) {
    console.warn(
      `[handle-webhook] Invalid headers from event ${eventId || "unknown"}: missing required headers`,
    );
    return new Response(JSON.stringify({ message: "Received (invalid headers)" }), {
      status: 200,
    });
  }

  // ─── Validate HMAC signature ─────────────────────────────────────
  // This is the ONLY case where we return non-2xx to Violet.
  try {
    const isValid = await validateHmac(rawBody, hmac);
    if (!isValid) {
      return new Response(JSON.stringify({ error: "Invalid signature" }), { status: 401 });
    }
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : "HMAC validation error",
      }),
      { status: 401 },
    );
  }

  // ─── Idempotency check ──────────────────────────────────────────
  const existing = await ctx.runQuery(internal.webhooks.violet.checkEvent, { eventId });
  if (existing) {
    return new Response(JSON.stringify({ message: "Event already processed" }), {
      status: 200,
    });
  }

  // ─── Parse payload ──────────────────────────────────────────────
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    // Malformed JSON — log and return 200
    await ctx.runMutation(internal.webhooks.violet.insertEvent, {
      eventId,
      eventType: "unknown",
      entityId: "unknown",
      payload: null,
      status: "failed",
      errorMessage: "Malformed JSON body",
    });
    return new Response(JSON.stringify({ message: "Received (malformed payload)" }), {
      status: 200,
    });
  }

  const entityId = String((payload as Record<string, unknown>)?.id ?? "unknown");

  // ─── Insert webhookEvents row (status: received) ────────────────
  await ctx.runMutation(internal.webhooks.violet.insertEvent, {
    eventId,
    eventType,
    entityId,
    payload,
    status: "received",
    errorMessage: undefined,
  });

  // ─── Route to internal mutation for processing ──────────────────
  try {
    await ctx.runMutation(internal.webhooks.violet.processEvent, {
      eventId,
      eventType,
      entityId,
      payload,
      reason,
    });
  } catch (err) {
    // Mark as failed — but still return 200 to Violet
    const message = err instanceof Error ? err.message : "Unknown processing error";
    await ctx.runMutation(internal.webhooks.violet.markEventStatus, {
      eventId,
      status: "failed",
      errorMessage: message,
    });
  }

  return new Response(JSON.stringify({ message: "Received" }), { status: 200 });
});

// ─── Internal Mutation — Insert Event ────────────────────────────────────────

export const insertEvent = internalMutation({
  args: {
    eventId: v.string(),
    eventType: v.string(),
    entityId: v.string(),
    payload: v.optional(v.any()),
    status: v.string(),
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("webhookEvents", {
      eventId: args.eventId,
      eventType: args.eventType,
      entityId: args.entityId,
      status: args.status as "received" | "processing" | "processed" | "failed",
      payload: args.payload,
      errorMessage: args.errorMessage,
      processedAt: args.status === "processed" ? Date.now() : undefined,
    });
  },
});

// ─── Internal Mutation — Update Event Status ─────────────────────────────────

export const markEventStatus = internalMutation({
  args: {
    eventId: v.string(),
    status: v.string(),
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, { eventId, status, errorMessage }) => {
    const event = await ctx.db
      .query("webhookEvents")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
      .first();

    if (event) {
      await ctx.db.patch("webhookEvents", event._id, {
        status: status as "received" | "processing" | "processed" | "failed",
        errorMessage,
        processedAt: status === "processed" ? Date.now() : undefined,
      });
    }
  },
});

// ─── Payload Validation Helper ──────────────────────────────────────────────

/**
 * Validates a webhook payload against the appropriate Zod schema for the event type.
 * Returns a parsed payload or throws with a descriptive error.
 *
 * Critical event types (order, bag, transfer, payout) get full Zod validation.
 * Audit-only types (offer, sync, collection, payment-tx) get light validation.
 * Unknown types pass through unchecked (already handled by the default case).
 *
 * Doc: https://docs.convex.dev/functions/validation — validate early, fail fast
 */
function validatePayload(
  eventType: string,
  payload: unknown,
): { success: boolean; data?: Record<string, unknown>; error?: string } {
  const record = payload as Record<string, unknown>;
  let result: { success: boolean; error?: string };

  switch (eventType) {
    // ─── ORDER events (critical — status updates) ───────────────
    case "ORDER_ACCEPTED":
    case "ORDER_UPDATED":
    case "ORDER_COMPLETED":
    case "ORDER_CANCELED":
    case "ORDER_CANCELLED":
    case "ORDER_REFUNDED":
    case "ORDER_RETURNED":
    case "ORDER_SHIPPED":
    case "ORDER_DELIVERED":
    case "ORDER_FAILED": {
      const parsed = violetOrderPayloadSchema.safeParse(record);
      result = parsed.success
        ? { success: true }
        : { success: false, error: `Zod validation failed: ${parsed.error.message}` };
      break;
    }

    // ─── BAG events (critical — tracking, refunds) ──────────────
    case "BAG_SHIPPED":
    case "BAG_SUBMITTED":
    case "BAG_ACCEPTED":
    case "BAG_COMPLETED":
    case "BAG_CANCELED":
    case "BAG_REFUNDED": {
      const parsed = violetBagPayloadSchema.safeParse(record);
      result = parsed.success
        ? { success: true }
        : { success: false, error: `Zod validation failed: ${parsed.error.message}` };
      break;
    }

    // ─── MERCHANT events ────────────────────────────────────────
    case "MERCHANT_CONNECTED":
    case "MERCHANT_DISCONNECTED":
    case "MERCHANT_ENABLED":
    case "MERCHANT_DISABLED":
    case "MERCHANT_COMPLETE":
    case "MERCHANT_NEEDS_ATTENTION": {
      const parsed = violetMerchantPayloadSchema.safeParse(record);
      result = parsed.success
        ? { success: true }
        : { success: false, error: `Zod validation failed: ${parsed.error.message}` };
      break;
    }

    // ─── TRANSFER events (critical — financial) ─────────────────
    case "TRANSFER_SENT":
    case "TRANSFER_PARTIALLY_SENT":
    case "TRANSFER_FAILED":
    case "TRANSFER_UPDATED":
    case "TRANSFER_REVERSED":
    case "TRANSFER_PARTIALLY_REVERSED":
    case "TRANSFER_REVERSAL_FAILED": {
      const parsed = violetTransferPayloadSchema.safeParse(record);
      result = parsed.success
        ? { success: true }
        : { success: false, error: `Zod validation failed: ${parsed.error.message}` };
      break;
    }

    // ─── PAYOUT ACCOUNT events (critical — KYC) ────────────────
    case "MERCHANT_PAYOUT_ACCOUNT_CREATED":
    case "MERCHANT_PAYOUT_ACCOUNT_REQUIREMENTS_UPDATED":
    case "MERCHANT_PAYOUT_ACCOUNT_ACTIVATED":
    case "MERCHANT_PAYOUT_ACCOUNT_DEACTIVATED": {
      const parsed = violetPayoutAccountPayloadSchema.safeParse(record);
      result = parsed.success
        ? { success: true }
        : { success: false, error: `Zod validation failed: ${parsed.error.message}` };
      break;
    }

    case "MERCHANT_PAYOUT_ACCOUNT_DELETED": {
      // Minimal payload: just { "id": number }
      if (typeof record.id !== "number") {
        result = { success: false, error: "Missing or invalid id in DELETED payload" };
      } else {
        result = { success: true };
      }
      break;
    }

    // ─── Audit-only events (light validation) ──────────────────
    case "OFFER_CREATED":
    case "OFFER_ADDED":
    case "OFFER_UPDATED":
    case "OFFER_REMOVED":
    case "OFFER_DELETED": {
      const parsed = violetOfferPayloadSchema.safeParse(record);
      result = parsed.success
        ? { success: true }
        : { success: false, error: `Zod validation failed: ${parsed.error.message}` };
      break;
    }

    case "PRODUCT_SYNC_STARTED":
    case "PRODUCT_SYNC_COMPLETED":
    case "PRODUCT_SYNC_FAILED":
    case "COLLECTION_SYNC_STARTED":
    case "COLLECTION_SYNC_COMPLETED":
    case "COLLECTION_SYNC_FAILED": {
      const parsed = violetSyncPayloadSchema.safeParse(record);
      result = parsed.success
        ? { success: true }
        : { success: false, error: `Zod validation failed: ${parsed.error.message}` };
      break;
    }

    case "COLLECTION_CREATED":
    case "COLLECTION_UPDATED":
    case "COLLECTION_REMOVED":
    case "COLLECTION_OFFERS_UPDATED": {
      const parsed = violetCollectionPayloadSchema.safeParse(record);
      result = parsed.success
        ? { success: true }
        : { success: false, error: `Zod validation failed: ${parsed.error.message}` };
      break;
    }

    case "PAYMENT_TRANSACTION_CAPTURE_STATUS_UPDATED":
    case "PAYMENT_TRANSACTION_CAPTURE_STATUS_AUTHORIZED":
    case "PAYMENT_TRANSACTION_CAPTURE_STATUS_CAPTURED":
    case "PAYMENT_TRANSACTION_CAPTURE_STATUS_REFUNDED":
    case "PAYMENT_TRANSACTION_CAPTURE_STATUS_PARTIALLY_REFUNDED":
    case "PAYMENT_TRANSACTION_CAPTURE_STATUS_FAILED": {
      const parsed = violetPaymentTransactionPayloadSchema.safeParse(record);
      result = parsed.success
        ? { success: true }
        : { success: false, error: `Zod validation failed: ${parsed.error.message}` };
      break;
    }

    default:
      result = { success: true };
  }

  return result.success ? { success: true, data: record } : { success: false, error: result.error };
}

// ─── Internal Mutation — Main Event Processor ────────────────────────────────

export const processEvent = internalMutation({
  args: {
    eventId: v.string(),
    eventType: v.string(),
    entityId: v.string(),
    payload: v.any(),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { eventId, eventType, payload, reason } = args;

    try {
      // ─── Validate payload via Zod before routing ──────────────
      const validation = validatePayload(eventType, payload);
      if (!validation.success) {
        const event = await ctx.db
          .query("webhookEvents")
          .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
          .first();
        if (event) {
          await ctx.db.patch("webhookEvents", event._id, {
            status: "failed",
            errorMessage: validation.error,
          });
        }
        return; // Don't process invalid payloads
      }

      switch (eventType) {
        // ─── ORDER events ────────────────────────────────────────
        case "ORDER_ACCEPTED":
        case "ORDER_UPDATED":
        case "ORDER_COMPLETED":
        case "ORDER_CANCELED":
        case "ORDER_CANCELLED":
        case "ORDER_REFUNDED":
        case "ORDER_RETURNED":
        case "ORDER_SHIPPED":
        case "ORDER_DELIVERED":
        case "ORDER_FAILED":
          await processOrderUpdated(ctx, eventId, payload);
          break;

        // ─── BAG events ──────────────────────────────────────────
        case "BAG_SHIPPED":
          await processBagShipped(ctx, eventId, payload);
          break;

        case "BAG_SUBMITTED":
        case "BAG_ACCEPTED":
        case "BAG_COMPLETED":
        case "BAG_CANCELED":
          await processBagUpdated(ctx, eventId, payload);
          break;

        case "BAG_REFUNDED":
          await processBagRefunded(ctx, eventId, payload);
          break;

        // ─── MERCHANT events ─────────────────────────────────────
        case "MERCHANT_CONNECTED":
          await processMerchantConnected(ctx, eventId, payload);
          break;

        case "MERCHANT_DISCONNECTED":
          await processMerchantDisconnected(ctx, eventId, payload);
          break;

        case "MERCHANT_ENABLED":
        case "MERCHANT_DISABLED":
          await processMerchantStatusChange(ctx, eventId, eventType, payload, reason);
          break;

        case "MERCHANT_COMPLETE":
        case "MERCHANT_NEEDS_ATTENTION":
          await markProcessed(ctx, eventId);
          break;

        // ─── TRANSFER events ─────────────────────────────────────
        case "TRANSFER_SENT":
        case "TRANSFER_PARTIALLY_SENT":
        case "TRANSFER_UPDATED":
          await processTransferSent(ctx, eventId, payload);
          break;

        case "TRANSFER_FAILED":
        case "TRANSFER_REVERSAL_FAILED":
          await processTransferFailed(ctx, eventId, payload);
          break;

        case "TRANSFER_REVERSED":
          await processTransferReversed(ctx, eventId, payload);
          break;

        case "TRANSFER_PARTIALLY_REVERSED":
          await processTransferPartiallyReversed(ctx, eventId, payload);
          break;

        // ─── PAYOUT ACCOUNT events ──────────────────────────────
        case "MERCHANT_PAYOUT_ACCOUNT_CREATED":
          await processPayoutAccountCreated(ctx, eventId, payload);
          break;

        case "MERCHANT_PAYOUT_ACCOUNT_REQUIREMENTS_UPDATED":
          await processPayoutAccountRequirementsUpdated(ctx, eventId, payload);
          break;

        case "MERCHANT_PAYOUT_ACCOUNT_DELETED":
          await processPayoutAccountDeleted(ctx, eventId, payload);
          break;

        case "MERCHANT_PAYOUT_ACCOUNT_ACTIVATED":
          await processPayoutAccountActivated(ctx, eventId, payload);
          break;

        case "MERCHANT_PAYOUT_ACCOUNT_DEACTIVATED":
          await processPayoutAccountDeactivated(ctx, eventId, payload);
          break;

        // ─── OFFER events (audit trail) ─────────────────────────
        case "OFFER_CREATED": // Deprecated — aliased to OFFER_ADDED
        case "OFFER_ADDED":
        case "OFFER_UPDATED":
        case "OFFER_REMOVED":
        case "OFFER_DELETED":
          console.log(`[offer] ${eventType}: id=${payload?.id} name="${payload?.name ?? ""}"`);
          await markProcessed(ctx, eventId);
          break;

        // ─── SYNC events (audit trail) ──────────────────────────
        case "PRODUCT_SYNC_STARTED":
        case "PRODUCT_SYNC_COMPLETED":
        case "PRODUCT_SYNC_FAILED":
        case "COLLECTION_SYNC_STARTED":
        case "COLLECTION_SYNC_COMPLETED":
        case "COLLECTION_SYNC_FAILED":
          console.log(
            `[sync] ${eventType}: merchant=${payload?.merchant_id} status=${payload?.status}`,
          );
          await markProcessed(ctx, eventId);
          break;

        // ─── COLLECTION events (audit trail) ────────────────────
        case "COLLECTION_CREATED":
        case "COLLECTION_UPDATED":
        case "COLLECTION_REMOVED":
        case "COLLECTION_OFFERS_UPDATED":
          console.log(`[collection] ${eventType}: id=${payload?.id} name="${payload?.name ?? ""}"`);
          await markProcessed(ctx, eventId);
          break;

        // ─── PAYMENT TRANSACTION events (audit trail) ───────────
        case "PAYMENT_TRANSACTION_CAPTURE_STATUS_UPDATED":
        case "PAYMENT_TRANSACTION_CAPTURE_STATUS_AUTHORIZED":
        case "PAYMENT_TRANSACTION_CAPTURE_STATUS_CAPTURED":
        case "PAYMENT_TRANSACTION_CAPTURE_STATUS_REFUNDED":
        case "PAYMENT_TRANSACTION_CAPTURE_STATUS_PARTIALLY_REFUNDED":
        case "PAYMENT_TRANSACTION_CAPTURE_STATUS_FAILED":
          console.log(
            `[payment-tx] ${eventType}: transaction=${payload?.id} status=${payload?.capture_status}`,
          );
          await markProcessed(ctx, eventId);
          break;

        default:
          console.warn(`[handle-webhook] Unknown event type "${eventType}" — acknowledged`);
          await markProcessed(ctx, eventId);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown processing error";
      const event = await ctx.db
        .query("webhookEvents")
        .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
        .first();

      if (event) {
        await ctx.db.patch("webhookEvents", event._id, {
          status: "failed",
          errorMessage: message,
        });
      }
      throw err;
    }
  },
});

// ─── Helper — Mark event as processed ────────────────────────────────────────

async function markProcessed(ctx: MutationCtx, eventId: string): Promise<void> {
  const event = await ctx.db
    .query("webhookEvents")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
    .first();

  if (event) {
    await ctx.db.patch("webhookEvents", event._id, {
      status: "processed",
      processedAt: Date.now(),
    });
  }
}

// ─── ORDER Processors ────────────────────────────────────────────────────────

async function processOrderUpdated(
  ctx: MutationCtx,
  eventId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const violetOrderId = String(payload.id);
  const status = String(payload.status ?? "PROCESSING");

  const order = await ctx.db
    .query("orders")
    .withIndex("by_violetOrderId", (q) => q.eq("violetOrderId", violetOrderId))
    .first();

  if (order) {
    await ctx.db.patch("orders", order._id, { status });
  } else {
    // Order not yet persisted — webhook arrived before checkout completed.
    // This is normal (Violet sends webhooks eagerly). No error log — just acknowledge.
    console.log(
      `[order] ORDER_* event for Violet order ${violetOrderId} — order not in DB yet (will be persisted on checkout)`,
    );
  }

  await markProcessed(ctx, eventId);
}

// ─── BAG Processors ──────────────────────────────────────────────────────────

async function processBagUpdated(
  ctx: MutationCtx,
  eventId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const violetBagId = String(payload.id);
  const violetOrderId = String(payload.order_id);
  const status = String(payload.status ?? "PROCESSING");

  const bag = await ctx.db
    .query("orderBags")
    .withIndex("by_violetBagId", (q) => q.eq("violetBagId", violetBagId))
    .first();

  if (!bag) {
    console.log(`[bag] Bag ${violetBagId} not found in DB`);
    await markProcessed(ctx, eventId);
    return;
  }

  const updateData: Record<string, unknown> = { status };
  if (payload.financial_status) updateData.financialStatus = String(payload.financial_status);
  if (payload.fulfillment_status) {
    updateData.fulfillmentStatus = String(payload.fulfillment_status);
  }

  await ctx.db.patch("orderBags", bag._id, updateData);
  await deriveAndUpdateOrderStatus(ctx, bag.orderId);

  // On BAG_COMPLETED: schedule delivery email + push notification
  if (status === "COMPLETED") {
    ctx.scheduler.runAfter(0, internal.webhooks.violet.syncDistributionsAndNotify, {
      violetOrderId,
      violetBagId,
      notificationType: "bag_delivered",
    });
  }

  await markProcessed(ctx, eventId);
}

async function processBagShipped(
  ctx: MutationCtx,
  eventId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const violetBagId = String(payload.id);
  const violetOrderId = String(payload.order_id);
  const status = String(payload.status ?? "SHIPPED");

  const bag = await ctx.db
    .query("orderBags")
    .withIndex("by_violetBagId", (q) => q.eq("violetBagId", violetBagId))
    .first();

  if (!bag) {
    console.log(`[bag] Bag ${violetBagId} not found in DB`);
    await markProcessed(ctx, eventId);
    return;
  }

  const updateData: Record<string, unknown> = { status };
  if (payload.financial_status) updateData.financialStatus = String(payload.financial_status);
  if (payload.fulfillment_status) {
    updateData.fulfillmentStatus = String(payload.fulfillment_status);
  }
  if (payload.tracking_number) updateData.trackingNumber = String(payload.tracking_number);
  if (payload.tracking_url) updateData.trackingUrl = String(payload.tracking_url);
  if (payload.carrier) updateData.carrier = String(payload.carrier);

  await ctx.db.patch("orderBags", bag._id, updateData);
  await deriveAndUpdateOrderStatus(ctx, bag.orderId);

  // Schedule shipping notification email + push
  ctx.scheduler.runAfter(0, internal.webhooks.violet.syncDistributionsAndNotify, {
    violetOrderId,
    violetBagId,
    notificationType: "bag_shipped",
  });

  await markProcessed(ctx, eventId);
}

async function processBagRefunded(
  ctx: MutationCtx,
  eventId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const violetBagId = String(payload.id);
  const violetOrderId = String(payload.order_id);
  const status = String(payload.status ?? "REFUNDED");

  const bag = await ctx.db
    .query("orderBags")
    .withIndex("by_violetBagId", (q) => q.eq("violetBagId", violetBagId))
    .first();

  if (!bag) {
    console.log(`[bag] Bag ${violetBagId} not found in DB`);
    await markProcessed(ctx, eventId);
    return;
  }

  const updateData: Record<string, unknown> = { status };
  if (payload.financial_status) updateData.financialStatus = String(payload.financial_status);
  if (payload.fulfillment_status) {
    updateData.fulfillmentStatus = String(payload.fulfillment_status);
  }
  await ctx.db.patch("orderBags", bag._id, updateData);
  await deriveAndUpdateOrderStatus(ctx, bag.orderId);
  await markProcessed(ctx, eventId);

  // Schedule refund detail fetch + notification (fire-and-forget via scheduler)
  ctx.scheduler.runAfter(0, internal.webhooks.violet.fetchRefundDetailsAndNotify, {
    violetOrderId,
    violetBagId,
    orderBagId: bag._id,
  });
}

// ─── Order Status Derivation ─────────────────────────────────────────────────

async function deriveAndUpdateOrderStatus(ctx: MutationCtx, orderId: Id<"orders">): Promise<void> {
  const order = await ctx.db.get("orders", orderId);
  if (!order) return;

  const bags = await ctx.db
    .query("orderBags")
    .withIndex("by_orderId", (q) => q.eq("orderId", orderId))
    .collect();

  if (bags.length === 0) return;

  const statuses = bags.map((b) => b.status);
  const uniqueStatuses = [...new Set(statuses)];

  let derivedStatus: string;
  if (uniqueStatuses.length === 1) {
    derivedStatus = uniqueStatuses[0];
  } else if (statuses.some((s) => s === "COMPLETED") && statuses.some((s) => s !== "COMPLETED")) {
    derivedStatus = "PARTIALLY_COMPLETED";
  } else if (statuses.some((s) => s === "SHIPPED") && statuses.some((s) => s !== "SHIPPED")) {
    derivedStatus = "PARTIALLY_SHIPPED";
  } else {
    derivedStatus = "PROCESSING";
  }

  if (order.status !== derivedStatus) {
    await ctx.db.patch("orders", orderId, { status: derivedStatus });
  }
}

// ─── MERCHANT Processors ─────────────────────────────────────────────────────

async function processMerchantConnected(
  ctx: MutationCtx,
  eventId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const violetMerchantId = Number(payload.id);
  const merchantName = String(payload.name ?? "Unknown");
  const source = String(payload.source ?? "Unknown");

  console.log(
    `[merchant] Merchant connected: id=${violetMerchantId} name="${merchantName}" source=${source}`,
  );

  const existing = await ctx.db
    .query("merchants")
    .withIndex("by_violetMerchantId", (q) => q.eq("violetMerchantId", violetMerchantId))
    .first();

  if (existing) {
    await ctx.db.patch("merchants", existing._id, {
      name: merchantName,
      status: "CONNECTED",
      violetData: payload,
    });
  } else {
    await ctx.db.insert("merchants", {
      violetMerchantId,
      name: merchantName,
      status: "CONNECTED",
      violetData: payload,
    });
  }

  await ctx.db.insert("errorLogs", {
    source: "webhook",
    errorType: "MERCHANT_CONNECTED",
    message: `Merchant "${merchantName}" (id=${violetMerchantId}, platform=${source}) connected`,
    context: { violetMerchantId, merchantName, source },
  });

  // Schedule auto-enable feature flags (fire-and-forget)
  ctx.scheduler.runAfter(0, internal.webhooks.violet.autoEnableMerchantFlags, {
    violetMerchantId: String(violetMerchantId),
  });

  await markProcessed(ctx, eventId);
}

async function processMerchantDisconnected(
  ctx: MutationCtx,
  eventId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const violetMerchantId = Number(payload.id);
  const merchantName = String(payload.name ?? "Unknown");

  const existing = await ctx.db
    .query("merchants")
    .withIndex("by_violetMerchantId", (q) => q.eq("violetMerchantId", violetMerchantId))
    .first();

  if (existing) {
    await ctx.db.patch("merchants", existing._id, { status: "DISCONNECTED" });
  }

  await ctx.db.insert("errorLogs", {
    source: "webhook",
    errorType: "MERCHANT_DISCONNECTED",
    message: `Merchant "${merchantName}" (id=${violetMerchantId}) disconnected`,
    context: { violetMerchantId, merchantName },
  });

  await markProcessed(ctx, eventId);
}

async function processMerchantStatusChange(
  ctx: MutationCtx,
  eventId: string,
  eventType: string,
  payload: Record<string, unknown>,
  reason?: string,
): Promise<void> {
  const violetMerchantId = Number(payload.id);
  const merchantName = String(payload.name ?? "Unknown");
  const isEnabled = eventType === "MERCHANT_ENABLED";

  const existing = await ctx.db
    .query("merchants")
    .withIndex("by_violetMerchantId", (q) => q.eq("violetMerchantId", violetMerchantId))
    .first();

  if (existing) {
    await ctx.db.patch("merchants", existing._id, { status: isEnabled ? "ENABLED" : "DISABLED" });
  }

  await ctx.db.insert("errorLogs", {
    source: "webhook",
    errorType: eventType,
    message: `Merchant "${merchantName}" (id=${violetMerchantId}) ${isEnabled ? "enabled" : "disabled"}${reason ? ` — reason: ${reason}` : ""}`,
    context: { violetMerchantId, merchantName, reason },
  });

  await markProcessed(ctx, eventId);
}

// ─── TRANSFER Processors ─────────────────────────────────────────────────────

async function upsertTransfer(ctx: MutationCtx, payload: Record<string, unknown>): Promise<void> {
  const violetTransferId = String(payload.id);
  const relatedOrders = payload.related_orders as string[] | undefined;
  const relatedBags = payload.related_bags as string[] | undefined;
  const violetOrderId = relatedOrders?.[0] ?? "";

  const row: Record<string, unknown> = {
    violetTransferId,
    violetOrderId,
    violetBagId: relatedBags?.[0] ? Number(relatedBags[0]) : undefined,
    type: "transfer",
    status: String(payload.status ?? "PENDING"),
    amount: payload.amount as number | undefined,
    currency: payload.currency as string | undefined,
    violetData: payload,
  };

  const existing = await ctx.db
    .query("orderTransfers")
    .withIndex("by_violetTransferId", (q) => q.eq("violetTransferId", violetTransferId))
    .first();

  if (existing) {
    await ctx.db.patch("orderTransfers", existing._id, row);
  } else {
    await ctx.db.insert("orderTransfers", row);
  }
}

async function processTransferSent(
  ctx: MutationCtx,
  eventId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await upsertTransfer(ctx, payload);
  await markProcessed(ctx, eventId);
}

async function processTransferFailed(
  ctx: MutationCtx,
  eventId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await upsertTransfer(ctx, payload);

  const errors = payload.errors as Array<Record<string, unknown>> | undefined;
  const errorSummary =
    errors
      ?.map((e) => {
        const code = String(e.error_code ?? e.code ?? "unknown");
        const msg = String(e.error_message ?? e.message ?? "No message");
        return `[${code}] ${msg}`;
      })
      .join("; ") ?? "No error details";

  await ctx.db.insert("errorLogs", {
    source: "webhook",
    errorType: "TRANSFER_FAILED",
    message: `Transfer ${payload.id} failed for merchant ${payload.merchant_id}: ${errorSummary}`,
    context: {
      transferId: payload.id,
      merchantId: payload.merchant_id,
      amount: payload.amount,
      currency: payload.currency,
      errors,
    },
  });

  await markProcessed(ctx, eventId);
}

async function processTransferReversed(
  ctx: MutationCtx,
  eventId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await upsertTransfer(ctx, payload);
  await markProcessed(ctx, eventId);
}

async function processTransferPartiallyReversed(
  ctx: MutationCtx,
  eventId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await upsertTransfer(ctx, payload);
  await markProcessed(ctx, eventId);
}

// ─── PAYOUT ACCOUNT Processors ──────────────────────────────────────────────

async function upsertPayoutAccount(
  ctx: MutationCtx,
  payload: Record<string, unknown>,
): Promise<void> {
  const violetPayoutAccountId = Number(payload.id);
  const merchantIdFromPayload = payload.merchant_id ?? payload.account_id;
  if (!merchantIdFromPayload) {
    console.warn(`[payoutAccount] No merchant_id in payload for PPA ${payload.id}`);
    return;
  }

  const merchant = await ctx.db
    .query("merchants")
    .withIndex("by_violetMerchantId", (q) =>
      q.eq("violetMerchantId", Number(merchantIdFromPayload)),
    )
    .first();

  if (!merchant) {
    console.warn(
      `[payoutAccount] Merchant ${merchantIdFromPayload} not found in DB for PPA ${payload.id}`,
    );
    return;
  }

  const isActive = Boolean(payload.is_active ?? false);
  const providerAccount = payload.payment_provider_account as Record<string, unknown> | undefined;

  const existing = await ctx.db
    .query("merchantPayoutAccounts")
    .withIndex("by_violetPayoutAccountId", (q) =>
      q.eq("violetPayoutAccountId", violetPayoutAccountId),
    )
    .first();

  const row = {
    violetPayoutAccountId,
    merchantId: merchant._id,
    type: String(payload.payment_provider ?? "stripe").toLowerCase(),
    status: isActive ? "active" : "inactive",
    requirements: providerAccount?.requirements ?? null,
    violetData: payload,
  };

  if (existing) {
    await ctx.db.patch("merchantPayoutAccounts", existing._id, row);
  } else {
    await ctx.db.insert("merchantPayoutAccounts", row);
  }
}

function checkKycAlerts(payload: Record<string, unknown>): Array<{
  type: string;
  message: string;
}> {
  const alerts: Array<{ type: string; message: string }> = [];
  const provider = String(payload.payment_provider ?? "STRIPE").toUpperCase();
  const providerAccount = payload.payment_provider_account as Record<string, unknown> | undefined;
  const requirements = providerAccount?.requirements as Record<string, unknown> | undefined;
  const merchantId = String(payload.merchant_id ?? payload.account_id ?? "");

  if (provider === "EXTERNAL") {
    alerts.push({
      type: "PAYOUT_ACCOUNT_EXTERNAL",
      message: `Merchant ${merchantId} has EXTERNAL payout account — manual transfers required`,
    });
    return alerts;
  }

  if (providerAccount && providerAccount.charges_enabled === false) {
    alerts.push({
      type: "PAYOUT_ACCOUNT_CHARGES_DISABLED",
      message: `Merchant ${merchantId} charges disabled`,
    });
  }

  if (providerAccount && providerAccount.payouts_enabled === false) {
    alerts.push({
      type: "PAYOUT_ACCOUNT_PAYOUTS_DISABLED",
      message: `Merchant ${merchantId} payouts disabled`,
    });
  }

  const pastDue = requirements?.past_due as string[] | undefined;
  if (pastDue && pastDue.length > 0) {
    alerts.push({
      type: "PAYOUT_ACCOUNT_KYC_PAST_DUE",
      message: `Merchant ${merchantId} has ${pastDue.length} past-due KYC requirements`,
    });
  }

  const currentlyDue = requirements?.currently_due as string[] | undefined;
  if (currentlyDue && currentlyDue.length > 0) {
    alerts.push({
      type: "PAYOUT_ACCOUNT_KYC_DUE",
      message: `Merchant ${merchantId} has ${currentlyDue.length} KYC requirements due`,
    });
  }

  return alerts;
}

async function processPayoutAccountCreated(
  ctx: MutationCtx,
  eventId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await upsertPayoutAccount(ctx, payload);

  const alerts = checkKycAlerts(payload);
  for (const alert of alerts) {
    await ctx.db.insert("errorLogs", {
      source: "webhook",
      errorType: alert.type,
      message: alert.message,
      context: { payoutAccountId: payload.id, merchantId: payload.merchant_id },
    });
  }

  await markProcessed(ctx, eventId);
}

async function processPayoutAccountRequirementsUpdated(
  ctx: MutationCtx,
  eventId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await upsertPayoutAccount(ctx, payload);

  const alerts = checkKycAlerts(payload);
  for (const alert of alerts) {
    await ctx.db.insert("errorLogs", {
      source: "webhook",
      errorType: alert.type,
      message: alert.message,
      context: { payoutAccountId: payload.id, merchantId: payload.merchant_id },
    });
  }

  await markProcessed(ctx, eventId);
}

async function processPayoutAccountDeleted(
  ctx: MutationCtx,
  eventId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const ppaId = Number(payload.id);

  const existing = await ctx.db
    .query("merchantPayoutAccounts")
    .withIndex("by_violetPayoutAccountId", (q) => q.eq("violetPayoutAccountId", ppaId))
    .first();

  if (existing) {
    await ctx.db.patch("merchantPayoutAccounts", existing._id, { status: "deleted" });
  }

  await markProcessed(ctx, eventId);
}

async function processPayoutAccountActivated(
  ctx: MutationCtx,
  eventId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await upsertPayoutAccount(ctx, payload);

  // Deactivate other PPAs for the same merchant (only one active at a time)
  const merchantIdFromPayload = payload.merchant_id ?? payload.account_id;
  if (merchantIdFromPayload) {
    const merchant = await ctx.db
      .query("merchants")
      .withIndex("by_violetMerchantId", (q) =>
        q.eq("violetMerchantId", Number(merchantIdFromPayload)),
      )
      .first();

    if (merchant) {
      const otherPpas = await ctx.db
        .query("merchantPayoutAccounts")
        .withIndex("by_merchantId", (q) => q.eq("merchantId", merchant._id))
        .collect();

      const ppaId = Number(payload.id);
      for (const ppa of otherPpas) {
        if (ppa.violetPayoutAccountId !== ppaId) {
          await ctx.db.patch("merchantPayoutAccounts", ppa._id, { status: "inactive" });
        }
      }

      // Log activation + deactivation count for admin audit trail
      const deactivatedCount = otherPpas.filter((p) => p.violetPayoutAccountId !== ppaId).length;
      if (deactivatedCount > 0) {
        await ctx.db.insert("errorLogs", {
          source: "webhook",
          errorType: "MERCHANT_PAYOUT_ACCOUNT_ACTIVATED",
          message: `Payout account ${ppaId} activated for merchant ${merchantIdFromPayload}. ${deactivatedCount} other PPA(s) deactivated.`,
          context: {
            payoutAccountId: ppaId,
            merchantId: merchantIdFromPayload,
            deactivatedCount,
          },
        });
      }
    }
  }

  await markProcessed(ctx, eventId);
}

async function processPayoutAccountDeactivated(
  ctx: MutationCtx,
  eventId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await upsertPayoutAccount(ctx, payload);
  await markProcessed(ctx, eventId);
}

// ─── Fire-and-Forget Actions (scheduled via ctx.scheduler) ───────────────────

/**
 * Fetches refund details from Violet API and sends refund notification.
 * Scheduled as an internal action so it doesn't block the webhook response.
 */
export const fetchRefundDetailsAndNotify = internalAction({
  args: {
    violetOrderId: v.string(),
    violetBagId: v.string(),
    orderBagId: v.id("orderBags"),
  },
  handler: async (ctx, { violetOrderId, violetBagId, orderBagId }) => {
    const { violetFetch } = await import("../lib/violetApi");
    const apiBase = process.env.VIOLET_API_BASE ?? "https://sandbox-api.violet.io/v1";

    try {
      const res = await violetFetch(
        `${apiBase}/orders/${violetOrderId}/bags/${violetBagId}/refunds`,
      );
      if (!res.ok) {
        console.warn(`[refund] Violet refund API returned ${res.status} for bag ${violetBagId}`);
        return;
      }

      const raw = (await res.json()) as unknown;
      const refunds: unknown[] = Array.isArray(raw)
        ? raw
        : (((raw as Record<string, unknown>).content as unknown[]) ?? []);

      for (const refund of refunds) {
        const r = refund as Record<string, unknown>;
        const amount = Number(r.amount);
        if (!Number.isFinite(amount) || amount < 0) continue;

        await ctx.runMutation(internal.webhooks.violet.upsertRefund, {
          orderBagId,
          violetRefundId: String(r.id),
          amount,
          reason: (r.refund_reason as string | undefined) ?? undefined,
          currency: (r.refund_currency as string | undefined) ?? "USD",
          status: (r.status as string | undefined) ?? "PROCESSED",
        });
      }
    } catch (err) {
      console.warn(
        `[refund] Error fetching refund details: ${err instanceof Error ? err.message : "Unknown"}`,
      );
    }

    // Send refund notification email
    try {
      await ctx.runAction(internal.webhooks.violet.sendWebhookNotification, {
        violetOrderId,
        violetBagId,
        notificationType: "refund_processed",
      });
    } catch {
      // Non-critical
    }

    // Send push notification
    try {
      await ctx.runAction(internal.webhooks.violet.sendPushForOrder, {
        violetOrderId,
        notificationType: "refund_processed",
      });
    } catch {
      // Non-critical
    }
  },
});

/**
 * Internal mutation to upsert a refund record.
 */
export const upsertRefund = internalMutation({
  args: {
    orderBagId: v.id("orderBags"),
    violetRefundId: v.string(),
    amount: v.number(),
    reason: v.optional(v.string()),
    currency: v.string(),
    status: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("orderRefunds")
      .withIndex("by_violetRefundId", (q) => q.eq("violetRefundId", args.violetRefundId))
      .first();

    if (existing) {
      await ctx.db.patch("orderRefunds", existing._id, {
        amount: args.amount,
        reason: args.reason,
        currency: args.currency,
        status: args.status,
      });
    } else {
      await ctx.db.insert("orderRefunds", args);
    }
  },
});

/**
 * Syncs distributions from Violet API and sends notification email.
 * Called after BAG_COMPLETED and BAG_SHIPPED events.
 */
export const syncDistributionsAndNotify = internalAction({
  args: {
    violetOrderId: v.string(),
    violetBagId: v.string(),
    notificationType: v.string(),
  },
  handler: async (ctx, { violetOrderId, violetBagId, notificationType }) => {
    // Sync distributions from Violet API
    try {
      const { violetFetch } = await import("../lib/violetApi");
      const apiBase = process.env.VIOLET_API_BASE ?? "https://sandbox-api.violet.io/v1";
      const res = await violetFetch(`${apiBase}/orders/${violetOrderId}/distributions`);

      if (res.ok) {
        const raw = (await res.json()) as unknown;
        const items: unknown[] = Array.isArray(raw)
          ? raw
          : (((raw as Record<string, unknown>).content as unknown[]) ?? []);

        for (const item of items) {
          const d = item as Record<string, unknown>;
          const bagId = d.bag_id != null ? String(d.bag_id) : undefined;
          const distId = d.id != null ? String(d.id) : undefined;
          await ctx.runMutation(internal.webhooks.violet.upsertDistribution, {
            distributionId: distId,
            violetOrderId,
            violetBagId: bagId,
            type: String(d.type ?? "PAYMENT"),
            channelAmount: typeof d.channel_amount === "number" ? d.channel_amount : undefined,
            stripeFee: typeof d.stripe_fee === "number" ? d.stripe_fee : undefined,
            merchantAmount: typeof d.merchant_amount === "number" ? d.merchant_amount : undefined,
            subtotal: typeof d.subtotal === "number" ? d.subtotal : undefined,
            amount: Number(d.channel_amount ?? 0),
            currency: "USD",
            status: String(d.status ?? "PENDING"),
            violetData: d,
          });
        }
      }
    } catch (err) {
      console.warn(
        `[distributions] Sync failed (non-critical): ${err instanceof Error ? err.message : "Unknown"}`,
      );
    }

    // Send notification email
    try {
      await ctx.runAction(internal.webhooks.violet.sendWebhookNotification, {
        violetOrderId,
        violetBagId,
        notificationType,
      });
    } catch {
      // Non-critical
    }

    // Send push notification if user is authenticated
    try {
      await ctx.runAction(internal.webhooks.violet.sendPushForOrder, {
        violetOrderId,
        notificationType,
      });
    } catch {
      // Non-critical
    }
  },
});

/**
 * Internal mutation to upsert a distribution record.
 * Uses distributionId (from Violet API) as deduplication key.
 * If no distributionId, falls back to insert (legacy distributions).
 */
export const upsertDistribution = internalMutation({
  args: {
    distributionId: v.optional(v.string()),
    violetOrderId: v.string(),
    violetBagId: v.optional(v.string()),
    type: v.string(),
    channelAmount: v.optional(v.number()),
    stripeFee: v.optional(v.number()),
    merchantAmount: v.optional(v.number()),
    subtotal: v.optional(v.number()),
    amount: v.number(),
    currency: v.optional(v.string()),
    status: v.optional(v.string()),
    violetData: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    // If we have a distributionId, try to find existing record
    if (args.distributionId) {
      const existing = await ctx.db
        .query("orderDistributions")
        .withIndex("by_distributionId", (q) => q.eq("distributionId", args.distributionId))
        .first();

      if (existing) {
        await ctx.db.patch("orderDistributions", existing._id, {
          amount: args.amount,
          channelAmount: args.channelAmount,
          stripeFee: args.stripeFee,
          merchantAmount: args.merchantAmount,
          subtotal: args.subtotal,
          status: args.status,
          violetData: args.violetData,
        });
        return;
      }
    }
    // No existing record — insert new
    await ctx.db.insert("orderDistributions", args);
  },
});

/**
 * Sends a webhook notification email (fire-and-forget action).
 * Replaces supabase/functions/send-notification/index.ts.
 */
export const sendWebhookNotification = internalAction({
  args: {
    violetOrderId: v.string(),
    violetBagId: v.optional(v.string()),
    notificationType: v.string(),
  },
  handler: async (ctx, { violetOrderId, notificationType }) => {
    if (!process.env.AUTH_RESEND_KEY) {
      console.warn("[send-notification] AUTH_RESEND_KEY not configured — skipping email");
      return;
    }

    // Get order data via internal query
    const order = await ctx.runQuery(internal.webhooks.violet.getOrderByVioletId, {
      violetOrderId,
    });

    if (!order) {
      console.warn(`[send-notification] Order ${violetOrderId} not found`);
      return;
    }

    const subject = getNotificationSubject(notificationType, violetOrderId);
    const html = buildNotificationHtml(notificationType, {
      _id: order._id,
      violetOrderId: order.violetOrderId,
      email: order.email,
      status: order.status,
      total: order.total,
      currency: order.currency,
    });

    const idempotencyKey = `${order._id}-${notificationType}`;

    const result = await sendRawEmail({
      to: order.email,
      subject,
      html,
      idempotencyKey,
    });

    if (result.success) {
      await ctx.runMutation(internal.webhooks.violet.logNotificationSend, {
        orderId: order._id,
        notificationType,
        recipientEmail: order.email,
        status: "sent",
        resendEmailId: result.resendEmailId,
      });
      await ctx.runMutation(internal.webhooks.violet.markOrderEmailSent, {
        orderId: order._id,
      });
    } else {
      console.error(`[send-notification] Resend API error: ${result.error}`);
      await ctx.runMutation(internal.webhooks.violet.logNotificationSend, {
        orderId: order._id,
        notificationType,
        recipientEmail: order.email,
        status: "failed",
        errorMessage: result.error,
      });
    }
  },
});

/**
 * Sends a push notification for an order event (fire-and-forget action).
 */
export const sendPushForOrder = internalAction({
  args: {
    violetOrderId: v.string(),
    notificationType: v.string(),
  },
  handler: async (ctx, { violetOrderId, notificationType }) => {
    const order = await ctx.runQuery(internal.webhooks.violet.getOrderByVioletId, {
      violetOrderId,
    });

    if (!order?.userId) return;

    const tokens = await ctx.runQuery(internal.webhooks.violet.getPushTokensForUser, {
      userId: order.userId,
    });

    if (!tokens || tokens.length === 0) return;

    const title = getPushTitle(notificationType);
    const body = getPushBody(notificationType, violetOrderId);

    const messages = tokens.map((t: { expoPushToken: string }) => ({
      to: t.expoPushToken,
      title,
      body,
      sound: "default",
      data: { order_id: violetOrderId, type: notificationType },
    }));

    try {
      await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(messages),
      });
    } catch {
      // Non-critical
    }
  },
});

/**
 * Auto-enables Violet feature flags for a newly connected merchant.
 */
export const autoEnableMerchantFlags = internalAction({
  args: { violetMerchantId: v.string() },
  handler: async (_ctx, { violetMerchantId }) => {
    const { violetFetch } = await import("../lib/violetApi");
    const apiBase = process.env.VIOLET_API_BASE ?? "https://sandbox-api.violet.io/v1";
    const flags = ["sync_collections", "sync_metadata", "sync_sku_metadata", "contextual_pricing"];

    for (const flag of flags) {
      try {
        const url = `${apiBase}/merchants/${violetMerchantId}/configuration/global_feature_flags/${flag}`;
        const res = await violetFetch(url, {
          method: "PUT",
          body: JSON.stringify({ enabled: true }),
        });
        if (res.ok) {
          console.log(`[merchant] Enabled flag ${flag} for merchant ${violetMerchantId}`);
        } else {
          const text = await res.text().catch(() => "");
          console.warn(
            `[merchant] Failed to enable ${flag} for merchant ${violetMerchantId}: ${res.status} ${text}`,
          );
        }
      } catch (err) {
        console.warn(
          `[merchant] Error enabling ${flag}: ${err instanceof Error ? err.message : "Unknown"}`,
        );
      }
    }
  },
});

// ─── Internal Query — Order by Violet ID (for actions) ──────────────────────

export const getOrderByVioletId = internalQuery({
  args: { violetOrderId: v.string() },
  handler: async (ctx, { violetOrderId }) => {
    return await ctx.db
      .query("orders")
      .withIndex("by_violetOrderId", (q) => q.eq("violetOrderId", violetOrderId))
      .first();
  },
});

// ─── Internal Query — Push tokens for user (for actions) ────────────────────

export const getPushTokensForUser = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    return await ctx.db
      .query("userPushTokens")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();
  },
});

// ─── Internal Mutations for Notification Logging ─────────────────────────────

export const logNotificationSend = internalMutation({
  args: {
    orderId: v.id("orders"),
    notificationType: v.string(),
    recipientEmail: v.string(),
    status: v.string(),
    resendEmailId: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("notificationLogs", {
      orderId: args.orderId,
      notificationType: args.notificationType,
      recipientEmail: args.recipientEmail,
      status: args.status,
      resendEmailId: args.resendEmailId,
      errorMessage: args.errorMessage,
      attempt: 1,
    });
  },
});

export const markOrderEmailSent = internalMutation({
  args: { orderId: v.id("orders") },
  handler: async (ctx, { orderId }) => {
    const order = await ctx.db.get("orders", orderId);
    if (order && !order.emailSent) {
      await ctx.db.patch("orders", orderId, { emailSent: true });
    }
  },
});

// ─── Email Helpers ───────────────────────────────────────────────────────────

const BRAND_COLOR = "#1a1a2e";
const ACCENT_COLOR = "#6c63ff";
const SUCCESS_COLOR = "#27ae60";
const BG_COLOR = "#f8f9fa";
const TEXT_COLOR = "#2d3436";
const MUTED_COLOR = "#636e72";

/** Format integer cents as “$X.XX” */
function formatCents(cents: number, currency = "USD"): string {
  const dollars = (cents / 100).toFixed(2);
  if (currency === "USD") return `$${dollars}`;
  return `${dollars} ${currency}`;
}

function getNotificationSubject(type: string, orderId: string): string {
  switch (type) {
    case "bag_shipped":
      return `Your order has shipped — #${orderId}`;
    case "bag_delivered":
      return `Your order has been delivered — #${orderId}`;
    case "refund_processed":
      return `Refund processed — #${orderId}`;
    case "order_confirmed":
      return `Order Confirmed — #${orderId}`;
    default:
      return `Update on your order #${orderId}`;
  }
}

/**
 * Shared email layout with branded header and footer.
 * All CSS is inline — email clients strip <style> tags.
 */
function emailLayout(title: string, content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${BG_COLOR};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:${TEXT_COLOR};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG_COLOR};">
<tr><td align="center" style="padding:24px 16px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;">
  <!-- Header -->
  <tr><td style="background:${BRAND_COLOR};padding:24px 32px;">
    <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:600;letter-spacing:0.5px;">${title}</h1>
  </td></tr>
  <!-- Body -->
  <tr><td style="padding:32px;">
    ${content}
  </td></tr>
  <!-- Footer -->
  <tr><td style="padding:24px 32px;background:#f1f2f6;border-top:1px solid #dfe6e9;">
    <p style="margin:0 0 8px;font-size:13px;color:${MUTED_COLOR};">Need help? Reply to this email or visit our store.</p>
    <p style="margin:0;font-size:11px;color:#b2bec3;">Maison Émile — Curified Shopping. This is a transactional email about your order.</p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

function ctaButton(text: string, url: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
<tr><td style="background:${ACCENT_COLOR};border-radius:6px;padding:12px 24px;">
  <a href="${url}" style="color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;display:inline-block;">${text}</a>
</td></tr>
</table>`;
}

/**
 * Builds a rich HTML email body for the notification type.
 * Uses the same layout as the Supabase send-notification/templates.ts
 * with branded header, content section, and footer.
 */
function buildNotificationHtml(
  type: string,
  order: {
    _id: Id<"orders">;
    violetOrderId: string;
    email: string;
    status: string;
    total?: number;
    currency?: string;
  },
): string {
  const orderId = order.violetOrderId;
  const appUrl = process.env.SITE_URL ?? "http://localhost:3000";
  const trackingUrl = `${appUrl}/account/orders/${order._id}`;

  // eslint-disable-next-line no-useless-assignment
  let title = "";
  // eslint-disable-next-line no-useless-assignment
  let content = "";

  switch (type) {
    case "bag_shipped":
      title = "Order Shipped";
      content = `
        <p style="margin:0 0 16px;font-size:16px;">Great news — your order has shipped! 📦</p>
        <p style="margin:0 0 24px;font-size:14px;color:${MUTED_COLOR};">Order #${escapeHtml(orderId)}</p>
        <p style="margin:0 0 16px;font-size:14px;">Your items are on their way. You can track your package in your account.</p>
        ${order.total != null ? `<p style="margin:0 0 24px;font-size:14px;color:${MUTED_COLOR};">Order total: ${formatCents(order.total, order.currency ?? "USD")}</p>` : ""}
        ${ctaButton("Track Your Order", trackingUrl)}`;
      break;

    case "bag_delivered":
      title = "Order Delivered";
      content = `
        <p style="margin:0 0 16px;font-size:16px;">Your order has been delivered! 🎉</p>
        <p style="margin:0 0 24px;font-size:14px;color:${MUTED_COLOR};">Order #${escapeHtml(orderId)}</p>
        <p style="margin:0 0 24px;font-size:14px;">We hope you enjoy your purchase!</p>
        ${ctaButton("View Your Order", trackingUrl)}`;
      break;

    case "refund_processed":
      title = "Refund Processed";
      content = `
        <p style="margin:0 0 16px;font-size:16px;">A refund has been processed for your order.</p>
        <p style="margin:0 0 24px;font-size:14px;color:${MUTED_COLOR};">Order #${escapeHtml(orderId)}</p>
        <div style="margin:16px 0;padding:16px;background:rgba(39,174,96,0.06);border-left:3px solid ${SUCCESS_COLOR};border-radius:0 6px 6px 0;">
          <p style="margin:0;font-size:16px;font-weight:600;color:${SUCCESS_COLOR};">Refund processed</p>
          <p style="margin:4px 0 0;font-size:14px;color:${MUTED_COLOR};">Please allow 5–10 business days for the refund to appear in your account.</p>
        </div>
        ${ctaButton("View Your Order", trackingUrl)}`;
      break;

    case "order_confirmed":
      title = "Order Confirmed";
      content = `
        <p style="margin:0 0 16px;font-size:16px;">Thank you for your order!</p>
        <p style="margin:0 0 24px;font-size:14px;color:${MUTED_COLOR};">Order #${escapeHtml(orderId)}</p>
        ${
          order.total != null
            ? `<div style="margin:24px 0;padding:16px;background:${BRAND_COLOR};border-radius:6px;">
          <p style="margin:0;color:#ffffff;font-size:18px;font-weight:600;text-align:right;">Total: ${formatCents(order.total, order.currency ?? "USD")}</p>
        </div>`
            : ""
        }
        ${ctaButton("Track Your Order", trackingUrl)}`;
      break;

    default:
      title = "Order Update";
      content = `
        <p style="margin:0 0 16px;font-size:16px;">Your order status has been updated.</p>
        <p style="margin:0 0 24px;font-size:14px;color:${MUTED_COLOR};">Order #${escapeHtml(orderId)} — Status: ${escapeHtml(order.status)}</p>
        ${ctaButton("View Your Order", trackingUrl)}`;
  }

  return emailLayout(title, content);
}

function getPushTitle(type: string): string {
  switch (type) {
    case "bag_shipped":
      return "Your order has shipped! 📦";
    case "bag_delivered":
      return "Your order has been delivered! 🎉";
    case "refund_processed":
      return "Refund processed";
    default:
      return "Order update";
  }
}

function getPushBody(type: string, orderId: string): string {
  switch (type) {
    case "bag_shipped":
      return `Order #${orderId} is on its way`;
    case "bag_delivered":
      return `Order #${orderId} has arrived`;
    case "refund_processed":
      return `A refund for order #${orderId} has been processed`;
    default:
      return `Order #${orderId} has been updated`;
  }
}
