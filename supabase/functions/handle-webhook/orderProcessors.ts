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

/** BAG_REFUNDED — delegates to processBagUpdated. */
export const processBagRefunded = processBagUpdated;
