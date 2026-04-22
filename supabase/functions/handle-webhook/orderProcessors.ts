/**
 * Webhook event processors for Violet order and bag status events (Story 5.2).
 *
 * ## Pipeline position
 *
 * These processors are invoked by `handle-webhook/index.ts` AFTER HMAC verification,
 * idempotency check, event claim, and Zod payload validation. They handle only
 * business logic — no HTTP, no auth, no deduplication concerns.
 *
 * ## Architecture: Extension of existing processor pattern
 *
 * Follows the same structure as processors.ts (OFFER_* events) — separate file
 * to keep order domain logic isolated from product catalog logic.
 * Imports `updateEventStatus` from processors.ts (no duplication).
 *
 * ## Violet order webhook event mapping
 *
 * Violet's webhook events are bag-scoped (one event per merchant bag, identified
 * by `X-Violet-Bag-Id` header). Our system handles both ORDER_* and BAG_* events:
 *
 * | Violet Event      | Our Processor          | DB Tables Affected              |
 * |-------------------|------------------------|---------------------------------|
 * | ORDER_UPDATED     | processOrderUpdated    | orders.status                   |
 * | ORDER_COMPLETED   | processOrderUpdated    | orders.status                   |
 * | ORDER_CANCELED    | processOrderUpdated    | orders.status                   |
 * | ORDER_REFUNDED    | processOrderUpdated    | orders.status                   |
 * | ORDER_RETURNED    | processOrderUpdated    | orders.status                   |
 * | BAG_SUBMITTED     | processBagUpdated      | order_bags.status + orders      |
 * | BAG_ACCEPTED      | processBagUpdated      | order_bags.status + orders      |
 * | BAG_SHIPPED       | processBagShipped      | order_bags.* + tracking + orders|
 * | BAG_COMPLETED     | processBagUpdated      | order_bags.status + orders + distributions |
 * | BAG_CANCELED      | processBagUpdated      | order_bags.status + orders      |
 * | BAG_REFUNDED      | processBagRefunded     | order_bags + order_refunds      |
 *
 * @see https://docs.violet.io/prism/webhooks/events/order-webhooks — Event reference
 *
 * ## Status derivation (FR25)
 *
 * After each bag status update, `deriveAndUpdateOrderStatus()` re-reads all bags
 * for the order and computes the derived order-level status:
 * - All bags same status -> that status (unanimous)
 * - Mixed with SHIPPED -> PARTIALLY_SHIPPED
 * - Mixed with COMPLETED -> PARTIALLY_COMPLETED
 * - Other mixed -> PROCESSING
 *
 * CANCELED != REFUNDED — tracked separately (AC#3). A canceled bag does not
 * imply a refund; refunds are confirmed via BAG_REFUNDED + Violet Refund API.
 *
 * ## Idempotency within processors
 *
 * - Bag status updates are idempotent (UPDATE with same values is a no-op)
 * - Refund upserts use `ON CONFLICT violet_refund_id` (safe for retries)
 * - Order status derivation is self-correcting (re-reads all bags each time)
 * - send-notification is fire-and-forget (notification_logs has its own dedup)
 *
 * ## Error handling
 *
 * All processors catch errors internally and call `updateEventStatus("failed", msg)`.
 * They never throw. The HTTP response is always 200 to prevent Violet retries.
 * Best-effort operations (refund fetch, notifications) log warnings but don't
 * fail the webhook event.
 *
 * ## Realtime
 *
 * No explicit Realtime broadcast needed. The `orders` and `order_bags` tables
 * are in the `supabase_realtime` publication (20260320000000_orders_realtime.sql).
 * Any UPDATE triggers automatic WebSocket broadcast to subscribed clients.
 *
 * @module orderProcessors
 * @see processors.ts — Offer/sync event processors (Story 3.7)
 * @see https://docs.violet.io/prism/webhooks/handling-webhooks — Retry/disable policy
 */

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import type { VioletOrderPayload, VioletBagPayload } from "../_shared/schemas.ts";
import { updateEventStatus } from "./processors.ts";

import { violetFetch } from "../_shared/fetchWithRetry.ts";

type DistributionType = "PAYMENT" | "REFUND" | "ADJUSTMENT";
type DistributionStatus = "PENDING" | "QUEUED" | "SENT" | "FAILED";

interface VioletDistribution {
  bagId: string | null;
  type: DistributionType;
  status: DistributionStatus;
  channelAmount: number;
  stripeFee: number;
  merchantAmount: number;
  subtotal: number;
}

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

/**
 * Looks up the authenticated user_id for an order (by Violet order ID).
 * Returns null for guest orders or if the order is not found.
 * Used to conditionally fire push notifications (guests get email only).
 */
async function getOrderUserId(
  supabase: SupabaseClient,
  violetOrderId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("orders")
    .select("user_id")
    .eq("violet_order_id", violetOrderId)
    .single();
  return data?.user_id ?? null;
}

/**
 * Fire-and-forget push notification for order events (Story 6.7).
 * Skips silently if user_id is null (guest order) or on any error.
 */
function firePushNotification(
  supabase: SupabaseClient,
  userId: string | null,
  type: string,
  title: string,
  body: string,
  data?: Record<string, unknown>,
): void {
  if (!userId) return;
  supabase.functions
    .invoke("send-push", {
      body: { user_id: userId, type, title, body, data },
    })
    .catch((err: unknown) => {
      console.warn(
        `[orderProcessors] send-push invoke failed (non-critical): ${err instanceof Error ? err.message : "Unknown"}`,
      );
    });
}

// ─── ORDER event processors ──────────────────────────────────────────

/**
 * Processes ORDER_UPDATED, ORDER_COMPLETED, ORDER_CANCELED, ORDER_REFUNDED, ORDER_RETURNED events.
 *
 * Updates the `orders.status` column directly with the Violet-provided status value.
 * All ORDER_* events delegate here because Violet sends the final/current status
 * in the payload — no transformation needed.
 *
 * Note: This updates the order-level status from Violet's perspective. Bag-level
 * events separately trigger `deriveAndUpdateOrderStatus()` which computes a
 * derived status from all bags. Both mechanisms coexist — ORDER_* events provide
 * Violet's authoritative status, while BAG_* events provide our computed view.
 *
 * @param supabase - Admin Supabase client (service_role)
 * @param eventId - Violet's X-Violet-Event-Id for webhook_events tracking
 * @param payload - Validated ORDER_* webhook payload with id and status
 *
 * @see https://docs.violet.io/prism/webhooks/events/order-webhooks — ORDER_UPDATED fires
 *   on any order property change including status, address, contact updates
 */
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
 * Generic bag status update processor for BAG_SUBMITTED, BAG_ACCEPTED, BAG_COMPLETED, BAG_CANCELED.
 *
 * Updates the `order_bags` row with the new status (and financial_status if present),
 * then triggers order-level status derivation from all bags.
 *
 * For BAG_COMPLETED (delivery confirmation), also fires a `send-notification`
 * invocation (fire-and-forget) to trigger the delivery email (Story 5.6).
 *
 * ## Idempotency
 * UPDATE with the same values is a database no-op. Derived status recalculation
 * is deterministic (always reads current bag states). Safe for duplicate webhooks.
 *
 * @param supabase - Admin Supabase client (service_role)
 * @param eventId - Violet's X-Violet-Event-Id for webhook_events tracking
 * @param payload - Validated BAG_* webhook payload with bag id, order_id, status
 *
 * @see deriveAndUpdateOrderStatus — Order-level status computation
 * @see https://docs.violet.io/prism/webhooks/events/order-webhooks — BAG events
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
    if (payload.fulfillment_status) {
      updateData.fulfillment_status = payload.fulfillment_status;
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
    // Fire-and-forget: sync distributions + notifications for COMPLETED bags
    if (payload.status === "COMPLETED") {
      // Sync payment distributions from Violet into order_distributions table.
      // Automatic Transfer mode creates distributions after capture — we persist
      // them here so the admin dashboard always has up-to-date financial data.
      void syncDistributionsForOrder(supabase, String(payload.order_id)).catch(
        (err: unknown) =>
          console.error(
            `[processBagUpdated] syncDistributions failed (non-critical): ${err instanceof Error ? err.message : "Unknown"}`,
          ),
      );
      supabase.functions
        .invoke("send-notification", {
          body: {
            type: "bag_delivered",
            order_id: String(payload.order_id),
            bag_id: String(payload.id),
          },
        })
        .catch((err: unknown) => {
          console.warn(
            `[processBagUpdated] send-notification invoke failed (non-critical): ${err instanceof Error ? err.message : "Unknown"}`,
          );
        });
      // Fire-and-forget: push notification (Story 6.7)
      const deliveredUserId = await getOrderUserId(supabase, String(payload.order_id));
      firePushNotification(
        supabase,
        deliveredUserId,
        "order_delivered",
        "Your order has been delivered!",
        `Order #${payload.order_id} has arrived`,
        { order_id: String(payload.order_id) },
      );
    }
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
 * Processes BAG_SHIPPED events — persists tracking info alongside status update.
 *
 * Separate from `processBagUpdated` because BAG_SHIPPED carries additional fields:
 * - `tracking_number` — carrier tracking number (e.g., "1Z999AA10123456784")
 * - `tracking_url` — direct tracking link from the carrier
 * - `carrier` — shipping carrier name (e.g., "UPS", "USPS", "FedEx")
 *
 * These fields are persisted to `order_bags` for display in the tracking UI (Story 5.3).
 * Also fires a `send-notification` invocation for the shipping confirmation email (Story 5.6).
 *
 * Per Violet docs, ORDER_SHIPPED fires when fulfillment status becomes SHIPPED or
 * PARTIALLY_SHIPPED. At the bag level, BAG_SHIPPED indicates this specific merchant
 * bag has shipped.
 *
 * @param supabase - Admin Supabase client (service_role)
 * @param eventId - Violet's X-Violet-Event-Id for webhook_events tracking
 * @param payload - Validated BAG_SHIPPED payload with tracking fields
 *
 * @see https://docs.violet.io/prism/webhooks/events/order-webhooks — ORDER_SHIPPED event
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
    if (payload.fulfillment_status) updateData.fulfillment_status = payload.fulfillment_status;
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
    // Fire-and-forget: bag shipped notification (Story 5.6)
    supabase.functions
      .invoke("send-notification", {
        body: {
          type: "bag_shipped",
          order_id: String(payload.order_id),
          bag_id: String(payload.id),
        },
      })
      .catch((err: unknown) => {
        console.warn(
          `[processBagShipped] send-notification invoke failed (non-critical): ${err instanceof Error ? err.message : "Unknown"}`,
        );
      });
    // Fire-and-forget: push notification (Story 6.7)
    const shippedUserId = await getOrderUserId(supabase, String(payload.order_id));
    firePushNotification(
      supabase,
      shippedUserId,
      "order_shipped",
      "Your order has shipped!",
      `Order #${payload.order_id} is on its way`,
      { order_id: String(payload.order_id) },
    );
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
 * Fetches payment distributions from Violet and upserts them into order_distributions.
 *
 * Called as fire-and-forget after BAG_COMPLETED — distributions are a financial
 * record, not a correctness requirement. The bag status is already persisted.
 *
 * ## Why here (Edge Function) instead of web server function?
 * The `syncOrderDistributionsFn` in the web app is a TanStack Start server function
 * only callable from the browser. The webhook Edge Function runs in Deno, so we
 * re-implement the sync logic directly (same pattern as fetchAndStoreRefundDetails).
 *
 * ## Idempotency
 * Upsert on `(violet_order_id, type, violet_bag_id)` UNIQUE constraint — safe for
 * repeated calls (e.g., multiple BAG_COMPLETED events for different bags).
 *
 * @see https://docs.violet.io/prism/payments/payouts/distributions
 * @see https://docs.violet.io/prism/payments/payment-settings/transfer-settings — Automatic Transfer
 */
async function syncDistributionsForOrder(
  supabase: SupabaseClient,
  violetOrderId: string,
): Promise<void> {
  const apiBase = Deno.env.get("VIOLET_API_BASE") ?? "https://sandbox-api.violet.io/v1";
  const url = `${apiBase}/orders/${violetOrderId}/distributions`;

  try {
    const res = await violetFetch(url);
    if (!res.ok) {
      console.warn(
        `[syncDistributions] Violet distributions API returned ${res.status} for order ${violetOrderId}`,
      );
      return;
    }

    const raw = (await res.json()) as unknown;
    const items: unknown[] = Array.isArray(raw)
      ? raw
      : (((raw as Record<string, unknown>).content as unknown[]) ?? []);

    if (items.length === 0) return;

    // Resolve order_bag_id for each distribution via violet_bag_id
    const bagIds = [
      ...new Set(
        items
          .map((item: unknown) => String((item as Record<string, unknown>)["bag_id"] ?? ""))
          .filter(Boolean),
      ),
    ];
    const { data: bagRows } = await supabase
      .from("order_bags")
      .select("id, violet_bag_id")
      .in("violet_bag_id", bagIds.length > 0 ? bagIds : ["__none__"]);

    const bagMap = new Map(
      (bagRows ?? []).map((b: { id: string; violet_bag_id: string }) => [
        b.violet_bag_id,
        b.id,
      ]),
    );

    const rows = items
      .map((item: unknown) => {
        const d = item as Record<string, unknown>;
        const bagId = d["bag_id"] != null ? String(d["bag_id"]) : null;
        const orderBagId = bagId ? bagMap.get(bagId) : null;
        if (!orderBagId) return null;
        return {
          order_bag_id: orderBagId,
          violet_order_id: violetOrderId,
          violet_bag_id: bagId,
          type: (d["type"] as DistributionType) ?? "PAYMENT",
          status: (d["status"] as DistributionStatus) ?? "PENDING",
          channel_amount_cents: Number(d["channel_amount"] ?? 0),
          stripe_fee_cents: Number(d["stripe_fee"] ?? 0),
          merchant_amount_cents: Number(d["merchant_amount"] ?? 0),
          subtotal_cents: Number(d["subtotal"] ?? 0),
          synced_at: new Date().toISOString(),
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    if (rows.length === 0) return;

    const { error: upsertError } = await supabase
      .from("order_distributions")
      .upsert(rows, { onConflict: "violet_order_id,type,violet_bag_id" });

    if (upsertError) {
      console.error(
        `[syncDistributions] Failed to upsert distributions for order ${violetOrderId}: ${upsertError.message}`,
      );
    } else {
      console.log(
        `[syncDistributions] Synced ${rows.length} distribution(s) for order ${violetOrderId}`,
      );
    }
  } catch (err) {
    console.warn(
      `[syncDistributions] Error: ${err instanceof Error ? err.message : "Unknown"}`,
    );
  }
}

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
  const apiBase = Deno.env.get("VIOLET_API_BASE") ?? "https://sandbox-api.violet.io/v1";
  const url = `${apiBase}/orders/${payload.order_id}/bags/${payload.id}/refunds`;
  try {
    const res = await violetFetch(url);
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
 * Background helper: fetches refund details from Violet and sends the refund notification.
 *
 * Runs as a fire-and-forget promise — never awaited by the webhook handler.
 * If anything fails here, the webhook has already returned 200 and the bag status
 * is persisted. The only consequence is missing refund amount details in the DB
 * and/or no email being sent, both of which are non-critical UX enhancements.
 *
 * @param supabase - Admin Supabase client (service_role)
 * @param orderId - Violet order ID (string)
 * @param bagId - Violet bag ID (string)
 * @param payload - Original BAG_REFUNDED webhook payload
 */
async function fetchRefundDetailsAndNotify(
  supabase: SupabaseClient,
  orderId: string,
  bagId: string,
  payload: VioletBagPayload,
): Promise<void> {
  // Fetch order_bags.id (UUID) for FK in order_refunds
  const { data: bagRow } = await supabase
    .from("order_bags")
    .select("id")
    .eq("violet_bag_id", bagId)
    .single();

  if (bagRow) {
    await fetchAndStoreRefundDetails(supabase, payload, bagRow.id);
  }

  // Trigger refund email (Story 5.6 implements send-notification)
  await supabase.functions.invoke("send-notification", {
    body: {
      type: "refund_processed",
      bag_id: bagId,
      order_id: orderId,
    },
  });
  // Fire-and-forget: push notification (Story 6.7)
  const refundUserId = await getOrderUserId(supabase, orderId);
  firePushNotification(
    supabase,
    refundUserId,
    "refund_processed",
    "Refund processed",
    `A refund for order #${orderId} has been processed`,
    { order_id: orderId },
  );
}

/**
 * Processes BAG_REFUNDED events — updates bag status, derives order status,
 * then kicks off refund detail fetching and notification as a background task.
 *
 * Replaces the `processBagRefunded = processBagUpdated` stub from Story 5.4.
 * Does NOT call `processBagUpdated` — logic is inlined to avoid a double DB round-trip.
 *
 * ## Violet webhook timeout constraint
 * Violet expects a 2xx response within **10 seconds** or it will consider the
 * delivery failed and schedule a retry (then eventually disable the endpoint).
 * The Violet Refund API call (`GET /v1/orders/{id}/bags/{id}/refunds`) and the
 * `send-notification` edge function invocation are both network-bound and could
 * exceed this budget. They are therefore **fire-and-forget** — launched but not
 * awaited, so the webhook returns 200 immediately after the critical DB writes.
 *
 * @see https://docs.violet.io/prism/webhooks/handling-webhooks — Retry/timeout policy
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
 * 1. **Synchronous (critical):** Update bag status in `order_bags`
 * 2. **Synchronous (critical):** Derive order-level status from all bags
 * 3. **Synchronous (critical):** Mark webhook_events as "processed"
 * 4. **Fire-and-forget (best-effort):** Fetch refund details from Violet API
 *    and send refund notification email ({@link fetchRefundDetailsAndNotify})
 *
 * If the background task (step 4) fails, refund amount/reason won't be stored
 * in `order_refunds` and no email is sent — but the bag status (REFUNDED) is
 * already persisted and the webhook is acknowledged. The refund details are a
 * UX enhancement, not a correctness requirement.
 *
 * @param supabase - Admin Supabase client (service_role)
 * @param eventId - Violet's X-Violet-Event-Id for webhook_events tracking
 * @param payload - Validated BAG_REFUNDED webhook payload
 *
 * @see fetchRefundDetailsAndNotify — Background task for refund details + notification
 * @see fetchAndStoreRefundDetails — Violet Refund API fetch + upsert logic
 */
export async function processBagRefunded(
  supabase: SupabaseClient,
  eventId: string,
  payload: VioletBagPayload,
): Promise<void> {
  try {
    // Step 1: Update bag status (critical — must complete before returning)
    const updateData: Record<string, unknown> = { status: payload.status };
    if (payload.financial_status) updateData.financial_status = payload.financial_status;
    if (payload.fulfillment_status) updateData.fulfillment_status = payload.fulfillment_status;
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
    // Step 2: Derive and update parent order status (critical)
    await deriveAndUpdateOrderStatus(supabase, String(payload.order_id));
    // Step 3: Mark event as processed (critical — before background work)
    await updateEventStatus(supabase, eventId, "processed");
    // Step 4: Fire-and-forget — fetch refund details and send notification
    // These must not block the webhook 200 response (Violet 10s timeout)
    void fetchRefundDetailsAndNotify(
      supabase,
      String(payload.order_id),
      String(payload.id),
      payload,
    ).catch((err) => console.error("[processBagRefunded] background task failed:", err));
  } catch (err) {
    await updateEventStatus(
      supabase,
      eventId,
      "failed",
      err instanceof Error ? err.message : "Unknown error in processBagRefunded",
    );
  }
}
