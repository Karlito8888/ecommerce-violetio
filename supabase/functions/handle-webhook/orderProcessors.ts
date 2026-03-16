/**
 * Webhook event processors for Violet order and bag status events (Story 5.2).
 *
 * ## Architecture: Extension of existing processor pattern
 *
 * Follows the same structure as processors.ts (OFFER_* events) — separate file
 * to keep order domain logic isolated from product catalog logic.
 * Imports `updateEventStatus` from processors.ts (no duplication).
 *
 * ## Status derivation (FR25)
 *
 * After each bag status update, `deriveAndUpdateOrderStatus()` re-reads all bags
 * for the order and computes the derived order-level status:
 * - All bags same status → that status
 * - Mixed with SHIPPED → PARTIALLY_SHIPPED
 * - Mixed with COMPLETED → PARTIALLY_COMPLETED
 * - Other mixed → PROCESSING
 *
 * CANCELED ≠ REFUNDED — tracked separately (AC#3).
 *
 * ## Realtime
 *
 * No explicit Realtime broadcast needed. The `orders` and `order_bags` tables
 * are in the `supabase_realtime` publication (20260320000000_orders_realtime.sql).
 * Any UPDATE triggers automatic WebSocket broadcast to subscribed clients.
 */

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import type { VioletOrderPayload, VioletBagPayload } from "../_shared/schemas.ts";
import { updateEventStatus } from "./processors.ts";
import { getVioletHeaders } from "../_shared/violetAuth.ts";

/**
 * Derives the overall order status from its bags' statuses and updates the order row.
 *
 * Called after every bag status update. Skips update if derived status matches current.
 * Returns silently if order not found (race condition with Story 5.1 persistence).
 *
 * Errors are logged but not thrown — the bag update already succeeded, and failing
 * the whole event would prevent retry (idempotency). A stale derived status is
 * self-correcting on the next bag webhook.
 */
async function deriveAndUpdateOrderStatus(
  supabase: SupabaseClient,
  violetOrderId: string,
): Promise<void> {
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("id, status")
    .eq("violet_order_id", violetOrderId)
    .single();

  if (orderError || !order) {
    if (orderError && orderError.code !== "PGRST116") {
      // Real DB error (not "no rows found" which is expected race condition)
      console.error(
        `[deriveAndUpdateOrderStatus] Failed to fetch order ${violetOrderId}:`,
        orderError.message,
      );
    }
    return;
  }

  const { data: bags, error: bagsError } = await supabase
    .from("order_bags")
    .select("status")
    .eq("order_id", order.id);

  if (bagsError) {
    console.error(
      `[deriveAndUpdateOrderStatus] Failed to fetch bags for order ${order.id}:`,
      bagsError.message,
    );
    return;
  }

  if (!bags || bags.length === 0) return;

  const statuses = bags.map((b: { status: string }) => b.status);
  const uniqueStatuses = [...new Set(statuses)];

  let derivedStatus: string;
  if (uniqueStatuses.length === 1) {
    derivedStatus = uniqueStatuses[0];
  } else if (
    statuses.some((s: string) => s === "COMPLETED") &&
    statuses.some((s: string) => s !== "COMPLETED")
  ) {
    derivedStatus = "PARTIALLY_COMPLETED";
  } else if (
    statuses.some((s: string) => s === "SHIPPED") &&
    statuses.some((s: string) => s !== "SHIPPED")
  ) {
    derivedStatus = "PARTIALLY_SHIPPED";
  } else {
    derivedStatus = "PROCESSING";
  }

  if (order.status !== derivedStatus) {
    const { error: updateError } = await supabase
      .from("orders")
      .update({ status: derivedStatus })
      .eq("id", order.id);

    if (updateError) {
      console.error(
        `[deriveAndUpdateOrderStatus] Failed to update order ${order.id} status to ${derivedStatus}:`,
        updateError.message,
      );
    }
  }
}

// ─── ORDER event processors ──────────────────────────────────────────

export async function processOrderUpdated(
  supabase: SupabaseClient,
  eventId: string,
  payload: VioletOrderPayload,
): Promise<void> {
  try {
    const { error } = await supabase
      .from("orders")
      .update({ status: payload.status })
      .eq("violet_order_id", String(payload.id));

    if (error) {
      await updateEventStatus(supabase, eventId, "failed", `Order update failed: ${error.message}`);
      return;
    }
    await updateEventStatus(supabase, eventId, "processed");
  } catch (err) {
    await updateEventStatus(
      supabase,
      eventId,
      "failed",
      err instanceof Error ? err.message : "Unknown error in processOrderUpdated",
    );
  }
}

/** ORDER_COMPLETED — delegates to processOrderUpdated (Violet sets final status). */
export const processOrderCompleted = processOrderUpdated;

/** ORDER_CANCELED — delegates to processOrderUpdated. */
export const processOrderCanceled = processOrderUpdated;

/** ORDER_REFUNDED — delegates to processOrderUpdated. */
export const processOrderRefunded = processOrderUpdated;

/** ORDER_RETURNED — delegates to processOrderUpdated. */
export const processOrderReturned = processOrderUpdated;

// ─── BAG event processors ────────────────────────────────────────────

/**
 * Generic bag status update processor.
 * Updates bag row, then derives order-level status from all bags.
 */
export async function processBagUpdated(
  supabase: SupabaseClient,
  eventId: string,
  payload: VioletBagPayload,
): Promise<void> {
  try {
    const updateData: Record<string, unknown> = {
      status: payload.status,
    };
    if (payload.financial_status) {
      updateData.financial_status = payload.financial_status;
    }

    const { error } = await supabase
      .from("order_bags")
      .update(updateData)
      .eq("violet_bag_id", String(payload.id));

    if (error) {
      await updateEventStatus(supabase, eventId, "failed", `Bag update failed: ${error.message}`);
      return;
    }

    await deriveAndUpdateOrderStatus(supabase, String(payload.order_id));
    await updateEventStatus(supabase, eventId, "processed");
  } catch (err) {
    await updateEventStatus(
      supabase,
      eventId,
      "failed",
      err instanceof Error ? err.message : "Unknown error in processBagUpdated",
    );
  }
}

/**
 * BAG_SHIPPED — includes tracking info (tracking_number, tracking_url, carrier).
 * Separate from processBagUpdated because it persists additional tracking fields.
 */
export async function processBagShipped(
  supabase: SupabaseClient,
  eventId: string,
  payload: VioletBagPayload,
): Promise<void> {
  try {
    const updateData: Record<string, unknown> = {
      status: payload.status,
    };
    if (payload.financial_status) updateData.financial_status = payload.financial_status;
    if (payload.tracking_number) updateData.tracking_number = payload.tracking_number;
    if (payload.tracking_url) updateData.tracking_url = payload.tracking_url;
    if (payload.carrier) updateData.carrier = payload.carrier;

    const { error } = await supabase
      .from("order_bags")
      .update(updateData)
      .eq("violet_bag_id", String(payload.id));

    if (error) {
      await updateEventStatus(
        supabase,
        eventId,
        "failed",
        `Bag shipped update failed: ${error.message}`,
      );
      return;
    }

    await deriveAndUpdateOrderStatus(supabase, String(payload.order_id));
    await updateEventStatus(supabase, eventId, "processed");
  } catch (err) {
    await updateEventStatus(
      supabase,
      eventId,
      "failed",
      err instanceof Error ? err.message : "Unknown error in processBagShipped",
    );
  }
}

/** BAG_SUBMITTED — delegates to processBagUpdated. */
export const processBagSubmitted = processBagUpdated;

/** BAG_ACCEPTED — delegates to processBagUpdated. */
export const processBagAccepted = processBagUpdated;

/** BAG_COMPLETED — delegates to processBagUpdated. */
export const processBagCompleted = processBagUpdated;

/** BAG_CANCELED — delegates to processBagUpdated (CANCELED ≠ REFUNDED per AC#3). */
export const processBagCanceled = processBagUpdated;

/**
 * Fetches refund details from the Violet API and upserts them into order_refunds.
 *
 * ## Why a separate API call?
 * Violet webhooks are "thin notifications" — the BAG_REFUNDED payload contains
 * only the bag status change (status, financial_status), NOT the refund amount
 * or reason. These details must be fetched from the Violet Refund API:
 *   `GET /v1/orders/{order_id}/bags/{bag_id}/refunds`
 *
 * @see https://docs.violet.io/api-reference/orders-and-checkout/order-refunds/refund-bag.md
 * @see https://docs.violet.io/prism/webhooks/events/order-webhooks.md
 *
 * ## Response format
 * Violet returns paginated responses: `{ content: [...], number, size, total_elements }`.
 * However, some endpoints may return a plain array. We handle both defensively.
 *
 * @see https://docs.violet.io/concepts/pagination.md
 *
 * ## Best-effort semantics
 * The bag status is already committed before this runs. If the Violet API call
 * fails, we log a warning and return without throwing, so the webhook event
 * still resolves as "processed". The refund amount is a UX enhancement, not
 * a correctness requirement — the bag status (REFUNDED) is the source of truth.
 *
 * ## Idempotency
 * Upsert on `violet_refund_id` (UNIQUE constraint) means retries are safe.
 * Repeated webhook deliveries won't create duplicate refund rows.
 */
async function fetchAndStoreRefundDetails(
  supabase: SupabaseClient,
  payload: VioletBagPayload,
  orderBagId: string,
): Promise<void> {
  const violetHeadersResult = await getVioletHeaders();
  if (violetHeadersResult.error) {
    console.warn(
      `[processBagRefunded] Cannot fetch refund details — Violet auth failed: ${violetHeadersResult.error.message}`,
    );
    return;
  }
  const apiBase = Deno.env.get("VIOLET_API_BASE") ?? "https://sandbox-api.violet.io/v1";
  const url = `${apiBase}/orders/${payload.order_id}/bags/${payload.id}/refunds`;
  try {
    const res = await fetch(url, {
      headers: { ...violetHeadersResult.data, Accept: "application/json" },
    });
    if (!res.ok) {
      console.warn(
        `[processBagRefunded] Violet refund API returned ${res.status} for bag ${payload.id}`,
      );
      return;
    }
    const raw = (await res.json()) as unknown;
    // Violet paginates: { content: [...] } or plain array — handle both defensively
    const refunds: unknown[] = Array.isArray(raw)
      ? raw
      : (((raw as Record<string, unknown>).content as unknown[]) ?? []);
    for (const refund of refunds) {
      const r = refund as Record<string, unknown>;
      const amount = Number(r.amount);
      if (!Number.isFinite(amount) || amount < 0) {
        console.warn(`[processBagRefunded] Skipping refund ${r.id} — invalid amount: ${r.amount}`);
        continue;
      }
      const { error } = await supabase.from("order_refunds").upsert(
        {
          order_bag_id: orderBagId,
          violet_refund_id: String(r.id),
          amount,
          reason: (r.refund_reason as string | undefined) ?? null,
          currency: (r.refund_currency as string | undefined) ?? "USD",
          status: (r.status as string | undefined) ?? "PROCESSED",
        },
        { onConflict: "violet_refund_id" },
      );
      if (error) {
        console.error(`[processBagRefunded] Failed to upsert refund ${r.id}: ${error.message}`);
      }
    }
  } catch (err) {
    console.warn(
      `[processBagRefunded] Violet refund fetch error: ${err instanceof Error ? err.message : "Unknown"}`,
    );
  }
}

/**
 * BAG_REFUNDED — updates bag status, derives order status, fetches refund details
 * from the Violet API, and fires a send-notification invocation (fire-and-forget).
 *
 * Replaces the `processBagRefunded = processBagUpdated` stub from Story 5.4.
 * Does NOT call `processBagUpdated` — logic is inlined to avoid a double DB round-trip.
 *
 * ## Violet REFUNDED vs CANCELED distinction
 * Per Violet docs, CANCELED is merchant-initiated order rejection that does NOT
 * trigger an automatic refund. REFUNDED/PARTIALLY_REFUNDED confirm actual monetary
 * transactions occurred. This function only runs for BAG_REFUNDED events — CANCELED
 * bags are handled by `processBagUpdated` and never fetch refund details.
 *
 * @see https://docs.violet.io/prism/checkout-guides/guides/order-and-bag-states.md
 *
 * ## Processing order (resilience-first)
 * 1. Update bag status (critical — always persisted first)
 * 2. Derive order-level status from all bags
 * 3. Fetch refund details from Violet API (best-effort, see {@link fetchAndStoreRefundDetails})
 * 4. Fire send-notification (fire-and-forget — Story 5.6 implements the function)
 *
 * Steps 3-4 cannot fail the webhook event. The bag status is the source of truth.
 */
export async function processBagRefunded(
  supabase: SupabaseClient,
  eventId: string,
  payload: VioletBagPayload,
): Promise<void> {
  try {
    // Step 1: Update bag status (same as processBagUpdated)
    const updateData: Record<string, unknown> = { status: payload.status };
    if (payload.financial_status) updateData.financial_status = payload.financial_status;
    const { error: bagError } = await supabase
      .from("order_bags")
      .update(updateData)
      .eq("violet_bag_id", String(payload.id));
    if (bagError) {
      await updateEventStatus(
        supabase,
        eventId,
        "failed",
        `Bag refund update failed: ${bagError.message}`,
      );
      return;
    }
    // Step 2: Derive and update parent order status
    await deriveAndUpdateOrderStatus(supabase, String(payload.order_id));
    // Step 3: Get order_bags.id (UUID) for FK in order_refunds
    const { data: bagRow } = await supabase
      .from("order_bags")
      .select("id")
      .eq("violet_bag_id", String(payload.id))
      .single();
    // Step 4: Fetch refund details from Violet API (best-effort — bag status already saved)
    if (bagRow) {
      await fetchAndStoreRefundDetails(supabase, payload, bagRow.id);
    }
    // Step 5: Trigger refund email (fire-and-forget — Story 5.6 implements send-notification)
    supabase.functions
      .invoke("send-notification", {
        body: {
          type: "refund_processed",
          bag_id: String(payload.id),
          order_id: String(payload.order_id),
        },
      })
      .catch((err: unknown) => {
        console.warn(
          `[processBagRefunded] send-notification invoke failed (non-critical, Story 5.6): ${err instanceof Error ? err.message : "Unknown"}`,
        );
      });
    await updateEventStatus(supabase, eventId, "processed");
  } catch (err) {
    await updateEventStatus(
      supabase,
      eventId,
      "failed",
      err instanceof Error ? err.message : "Unknown error in processBagRefunded",
    );
  }
}
