/**
 * Edge Function: send-notification
 *
 * Sends transactional email notifications for order lifecycle events.
 * Invoked fire-and-forget from handle-webhook processors via
 * `supabase.functions.invoke("send-notification", { body })`.
 *
 * ## Supported notification types
 * | Type | Trigger | Webhook Event |
 * |------|---------|---------------|
 * | `order_confirmed` | Checkout completion | N/A (direct invocation) |
 * | `bag_shipped` | processBagShipped | BAG_SHIPPED |
 * | `bag_delivered` | processBagUpdated | BAG_COMPLETED (status=COMPLETED) |
 * | `refund_processed` | processBagRefunded | BAG_REFUNDED |
 *
 * ## Refund notification flow
 * 1. BAG_REFUNDED webhook arrives → processBagRefunded updates bag status
 * 2. processBagRefunded calls fetchAndStoreRefundDetails (Violet Refund API)
 * 3. Refund details upserted into order_refunds table
 * 4. processBagRefunded invokes send-notification (fire-and-forget)
 * 5. This function fetches order + bags + items + refunds from Supabase
 * 6. renderRefundProcessed sums all refund amounts for the bag
 * 7. Email sent via Resend API with Idempotency-Key header
 * 8. Result logged to notification_logs table
 *
 * ## Delivery pipeline
 * - Uses Resend API via raw fetch (no npm SDK — Deno runtime constraint)
 * - Retry: up to 3 attempts with exponential backoff (0ms, 1s, 3s)
 * - Non-retryable errors (400/401/403/422) fail immediately
 * - Retryable errors (429/500) + network errors trigger backoff
 * - Idempotency-Key prevents duplicate sends across retries
 *
 * ## Error handling
 * - Always returns HTTP 200 (callers use fire-and-forget)
 * - Missing RESEND_API_KEY → graceful skip (no error)
 * - All failures logged to notification_logs for operational visibility
 * - Notification failures NEVER propagate to the calling webhook processor
 *
 * ## Cancellation vs Refund
 * Per Violet.io docs, CANCELED is merchant-initiated rejection WITHOUT automatic
 * refund. Only REFUNDED/PARTIALLY_REFUNDED bags trigger refund notifications.
 * There is no "bag_canceled" notification type — canceled bags are not emailed.
 *
 * @see https://docs.violet.io/api-reference/orders-and-checkout/order-refunds/refund-bag.md — Refund API
 * @see https://docs.violet.io/api-reference/orders-and-checkout/order-cancellations/cancel-order.md — Cancel Order API
 * @see https://docs.violet.io/api-reference/orders-and-checkout/order-cancellations/cancel-bag.md — Cancel Bag API
 * @see https://docs.violet.io/prism/webhooks/events/order-webhooks.md — Webhook events
 * @see https://docs.resend.com/api-reference/emails/send-email — Resend email API
 */

import { corsHeaders } from "../_shared/cors.ts";
import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { renderEmail } from "./templates.ts";
import type { NotificationType, NotificationPayload, OrderContext, BagContext } from "./types.ts";

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

const VALID_TYPES: NotificationType[] = [
  "order_confirmed",
  "bag_shipped",
  "bag_delivered",
  "refund_processed",
];

const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [0, 1000, 3000];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Writes a row to the `notification_logs` table for audit and retry tracking.
 *
 * Each send attempt (success or failure) is logged as a separate row.
 * A single notification can produce up to MAX_ATTEMPTS (3) rows.
 *
 * Logging failures are non-fatal — the email send result takes precedence.
 * If logging fails, a console.error is emitted but the function continues.
 */
async function logNotification(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  orderId: string,
  notificationType: string,
  recipientEmail: string,
  status: string,
  resendEmailId: string | null,
  errorMessage: string | null,
  attempt: number,
): Promise<void> {
  const { error } = await supabase.from("notification_logs").insert({
    order_id: orderId,
    notification_type: notificationType,
    recipient_email: recipientEmail,
    status,
    resend_email_id: resendEmailId,
    error_message: errorMessage,
    attempt,
  });
  if (error) {
    console.error(`[send-notification] Failed to log notification: ${error.message}`);
  }
}

function successResponse(data: Record<string, unknown>): Response {
  return new Response(JSON.stringify({ data, error: null }), {
    status: 200,
    headers: jsonHeaders,
  });
}

function errorResponse(message: string): Response {
  return new Response(JSON.stringify({ data: null, error: { message } }), {
    status: 200, // Always 200 — callers use fire-and-forget
    headers: jsonHeaders,
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  if (!RESEND_API_KEY) {
    console.warn("[send-notification] RESEND_API_KEY not configured — skipping email");
    return successResponse({ sent: false, error: "RESEND_API_KEY not configured" });
  }

  const APP_URL = Deno.env.get("APP_URL") ?? "http://localhost:3000";

  let payload: NotificationPayload;
  try {
    payload = await req.json();
  } catch {
    return errorResponse("Invalid JSON body");
  }

  // Validate payload
  if (!payload.type || !VALID_TYPES.includes(payload.type)) {
    return errorResponse(`Invalid notification type: ${payload.type}`);
  }
  if (!payload.order_id) {
    return errorResponse("Missing order_id");
  }
  const needsBag = payload.type !== "order_confirmed";
  if (needsBag && !payload.bag_id) {
    return errorResponse(`${payload.type} requires bag_id`);
  }

  const supabase = getSupabaseAdmin();

  /**
   * Fetch order context with nested bags, items, refunds.
   *
   * IMPORTANT: Query by `violet_order_id`, NOT by `id` (UUID primary key).
   * `payload.order_id` is Violet's numeric order ID (as a string), passed from
   * webhook processors in orderProcessors.ts via `String(payload.order_id)`.
   *
   * Data flow: Violet webhook -> handle-webhook/index.ts -> orderProcessors.ts
   * (processBagShipped, processBagUpdated, processBagRefunded) -> invokes
   * send-notification with `{ order_id: String(payload.order_id) }`.
   *
   * Previously queried by `id` (UUID) which caused all webhook-triggered
   * notifications to silently fail — the numeric Violet ID never matched
   * a UUID, so the order was never found and no emails were sent.
   */
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select(
      `
      *,
      order_bags (
        *,
        order_items (*),
        order_refunds (*)
      )
    `,
    )
    .eq("violet_order_id", payload.order_id)
    .single();

  if (orderError || !order) {
    const msg = `Order not found: ${payload.order_id}${orderError ? ` — ${orderError.message}` : ""}`;
    console.error(`[send-notification] ${msg}`);
    return errorResponse(msg);
  }

  const orderCtx = order as unknown as OrderContext;

  // Find specific bag if needed
  let bagCtx: BagContext | null = null;
  if (needsBag && payload.bag_id) {
    bagCtx = orderCtx.order_bags.find((b) => b.violet_bag_id === payload.bag_id) ?? null;
    if (!bagCtx) {
      const msg = `Bag not found: ${payload.bag_id} in order ${payload.order_id}`;
      console.warn(`[send-notification] ${msg}`);
      return errorResponse(msg);
    }
  }

  // Render email
  let email;
  try {
    email = renderEmail(payload.type, orderCtx, bagCtx, APP_URL);
  } catch (err) {
    const msg = `Template render failed: ${err instanceof Error ? err.message : "Unknown"}`;
    console.error(`[send-notification] ${msg}`);
    await logNotification(
      supabase,
      orderCtx.id,
      payload.type,
      orderCtx.email,
      "failed",
      null,
      msg,
      1,
    );
    return errorResponse(msg);
  }

  // Idempotency key: unique per notification event, stable across retries within
  // this invocation AND across duplicate webhook deliveries. Resend deduplicates
  // emails with the same Idempotency-Key within a 24-hour window.
  // Format: "{order_uuid}-{type}" or "{order_uuid}-{type}-{bag_uuid}"
  const idempotencyKey = `${orderCtx.id}-${payload.type}${bagCtx ? `-${bagCtx.id}` : ""}`;

  // Send via Resend API with retry
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (attempt > 1) await sleep(BACKOFF_MS[attempt - 1]);

    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${RESEND_API_KEY}`,
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify(email),
      });

      if (res.ok) {
        const { id: resendEmailId } = (await res.json()) as { id: string };
        await logNotification(
          supabase,
          orderCtx.id,
          payload.type,
          orderCtx.email,
          "sent",
          resendEmailId,
          null,
          attempt,
        );
        // Update orders.email_sent flag only on first successful notification.
        // The .eq("email_sent", false) guard makes this a no-op for subsequent emails,
        // avoiding unnecessary writes. This flag is a simple boolean (not per-notification).
        await supabase
          .from("orders")
          .update({ email_sent: true })
          .eq("id", orderCtx.id)
          .eq("email_sent", false);
        return successResponse({ sent: true, resend_id: resendEmailId });
      }

      const status = res.status;
      const errorBody = await res.text();

      // Non-retryable errors
      if ([400, 401, 403, 404, 422].includes(status)) {
        await logNotification(
          supabase,
          orderCtx.id,
          payload.type,
          orderCtx.email,
          "failed",
          null,
          `${status}: ${errorBody}`,
          attempt,
        );
        console.error(
          `[send-notification] Non-retryable error ${status} for ${payload.type}: ${errorBody}`,
        );
        return successResponse({ sent: false, error: `Non-retryable: ${status}` });
      }

      // Retryable (429, 500) — log attempt and continue
      await logNotification(
        supabase,
        orderCtx.id,
        payload.type,
        orderCtx.email,
        "failed",
        null,
        `${status}: ${errorBody} (attempt ${attempt}/${MAX_ATTEMPTS})`,
        attempt,
      );
      console.warn(
        `[send-notification] Retryable error ${status} (attempt ${attempt}/${MAX_ATTEMPTS}): ${errorBody}`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown fetch error";
      await logNotification(
        supabase,
        orderCtx.id,
        payload.type,
        orderCtx.email,
        "failed",
        null,
        `Network error: ${msg} (attempt ${attempt}/${MAX_ATTEMPTS})`,
        attempt,
      );
      console.warn(
        `[send-notification] Network error (attempt ${attempt}/${MAX_ATTEMPTS}): ${msg}`,
      );
    }
  }

  console.error(
    `[send-notification] Max retries exceeded for ${payload.type} on order ${payload.order_id}`,
  );
  return successResponse({ sent: false, error: "Max retries exceeded" });
});
