/**
 * Email templates for the send-notification Edge Function (Story 5.6).
 *
 * Renders HTML email content for four order lifecycle notification types:
 * - {@link renderOrderConfirmed}: Full order summary with all bags/items/totals
 * - {@link renderBagShipped}: Shipping confirmation with tracking info for one bag
 * - {@link renderBagDelivered}: Delivery confirmation for one bag
 * - {@link renderRefundProcessed}: Refund acknowledgment with amount/reason for one bag
 *
 * ## Design constraints
 * - All CSS is inline (`style="..."`) — email clients strip `<style>` tags
 * - Single-column layout, max 600px width, for mobile email client compatibility
 * - XSS prevention via {@link escapeHtml} on all user-provided strings
 * - Monetary amounts stored as integer cents, formatted via {@link formatCents}
 * - Guest tracking URLs fall back to `/order/lookup` (raw token not stored, only SHA-256 hash)
 *
 * ## Refund email specifics
 * The refund template sums ALL refund records for a bag (supporting partial refunds).
 * Violet's Refund API allows multiple partial refunds per bag, each stored as a
 * separate `order_refunds` row. The first non-null reason is displayed.
 *
 * @see https://docs.violet.io/api-reference/orders-and-checkout/order-refunds/refund-bag.md — Partial/full refunds
 * @see https://docs.violet.io/prism/checkout-guides/guides/order-and-bag-states.md — Bag status lifecycle
 * @see https://docs.resend.com/api-reference/emails/send-email — Resend email format
 */
import type { NotificationType, OrderContext, BagContext, EmailPayload } from "./types.ts";

/** Escape HTML special characters to prevent XSS in email templates */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Format integer cents as "$X.XX" */
function formatCents(cents: number, currency = "USD"): string {
  const dollars = (cents / 100).toFixed(2);
  if (currency === "USD") return `$${dollars}`;
  return `${dollars} ${currency}`;
}

/**
 * Map Violet bag status codes to user-friendly labels for email display.
 *
 * This is a local re-implementation of BAG_STATUS_LABELS from
 * `packages/shared/src/utils/orderStatusDerivation.ts` — shared package
 * is not available in Deno Edge Functions (different runtime).
 *
 * ## Violet bag status → label mapping
 * - `IN_PROGRESS`, `SUBMITTED` → "Processing" (pre-merchant-acceptance states)
 * - `ACCEPTED` → "Confirmed" (merchant accepted the bag)
 * - `SHIPPED` → "Shipped" (BAG_SHIPPED webhook; not in Violet's BagStatus enum but sent in payloads)
 * - `COMPLETED` → "Delivered" (all fulfillments shipped and confirmed)
 * - `CANCELED` → "Canceled" (merchant cancellation, terminal)
 * - `REFUNDED` → "Refunded" (full refund, terminal)
 * - `PARTIALLY_REFUNDED` → "Partially Refunded" (some items refunded, can transition to REFUNDED)
 * - `REJECTED` → "Rejected" (platform rejection after retries, terminal)
 * - `BACKORDERED` → "Backordered" (items backordered on merchant platform)
 *
 * @see https://docs.violet.io/prism/checkout-guides/guides/order-and-bag-states.md
 * @see https://docs.violet.io/prism/checkout-guides/carts-and-bags/bags/states-of-a-bag
 */
const STATUS_LABELS: Record<string, string> = {
  IN_PROGRESS: "Processing",
  SUBMITTED: "Processing",
  ACCEPTED: "Confirmed",
  SHIPPED: "Shipped",
  COMPLETED: "Delivered",
  CANCELED: "Canceled",
  REFUNDED: "Refunded",
  PARTIALLY_REFUNDED: "Partially Refunded",
  REJECTED: "Rejected",
  BACKORDERED: "Backordered",
};

function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

/**
 * Build the order tracking URL for email CTA buttons.
 *
 * - Authenticated users → `/account/orders/{orderId}` (direct link)
 * - Guest users → `/order/lookup` (email verification flow from Story 5.4)
 *
 * Guest limitation: We only store `order_lookup_token_hash` (SHA-256), not the
 * raw token. The raw token was shown at checkout confirmation and is not
 * retrievable. Guests must use the email lookup flow to verify their identity.
 */
function getTrackingUrl(order: OrderContext, appUrl: string): string {
  if (order.user_id) {
    return `${appUrl}/account/orders/${order.id}`;
  }
  // Guest: direct to email lookup (raw token not stored, only hash)
  return `${appUrl}/order/lookup`;
}

// ─── Shared layout ──────────────────────────────────────────────────

const BRAND_COLOR = "#1a1a2e";
const ACCENT_COLOR = "#6c63ff";
const SUCCESS_COLOR = "#27ae60";
const BG_COLOR = "#f8f9fa";
const TEXT_COLOR = "#2d3436";
const MUTED_COLOR = "#636e72";

function layout(title: string, content: string, appUrl: string): string {
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
    <p style="margin:0 0 8px;font-size:13px;color:${MUTED_COLOR};">Need help? Visit <a href="${appUrl}" style="color:${ACCENT_COLOR};text-decoration:none;">our store</a> or reply to this email.</p>
    <p style="margin:0;font-size:11px;color:#b2bec3;">This is a transactional email about your order. No action needed to continue receiving order updates.</p>
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

function itemsTable(items: BagContext["order_items"], currency: string): string {
  const rows = items
    .map(
      (item) =>
        `<tr>
      <td style="padding:8px 0;border-bottom:1px solid #f1f2f6;font-size:14px;">${escapeHtml(item.product_name)}${item.sku_name ? ` <span style="color:${MUTED_COLOR};">(${escapeHtml(item.sku_name)})</span>` : ""}</td>
      <td style="padding:8px 0;border-bottom:1px solid #f1f2f6;font-size:14px;text-align:center;">${item.quantity}</td>
      <td style="padding:8px 0;border-bottom:1px solid #f1f2f6;font-size:14px;text-align:right;">${formatCents(item.price, currency)}</td>
    </tr>`,
    )
    .join("");

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
  <tr>
    <th style="padding:8px 0;border-bottom:2px solid #dfe6e9;font-size:12px;text-transform:uppercase;color:${MUTED_COLOR};text-align:left;">Item</th>
    <th style="padding:8px 0;border-bottom:2px solid #dfe6e9;font-size:12px;text-transform:uppercase;color:${MUTED_COLOR};text-align:center;">Qty</th>
    <th style="padding:8px 0;border-bottom:2px solid #dfe6e9;font-size:12px;text-transform:uppercase;color:${MUTED_COLOR};text-align:right;">Price</th>
  </tr>
  ${rows}
</table>`;
}

// ─── Template renderers ─────────────────────────────────────────────

/**
 * Renders the "Order Confirmed" email — sent once at checkout completion.
 *
 * Includes: order number, date, all bags grouped by merchant with item tables,
 * per-bag subtotals, overall order total, and a CTA to track the order.
 *
 * Trigger: Checkout completion (NOT webhook-driven — invoked directly from the
 * order persistence flow). This is the only notification type not triggered
 * by a Violet webhook event.
 */
function renderOrderConfirmed(order: OrderContext, appUrl: string): EmailPayload {
  const trackingUrl = getTrackingUrl(order, appUrl);
  const bagsHtml = order.order_bags
    .map(
      (bag) => `
    <div style="margin:16px 0;padding:16px;background:#f8f9fa;border-radius:6px;">
      <p style="margin:0 0 12px;font-size:14px;font-weight:600;">From: ${escapeHtml(bag.merchant_name)}</p>
      ${itemsTable(bag.order_items, order.currency)}
      <p style="margin:12px 0 0;font-size:14px;text-align:right;font-weight:600;">Subtotal: ${formatCents(bag.total, order.currency)}</p>
    </div>`,
    )
    .join("");

  const content = `
    <p style="margin:0 0 16px;font-size:16px;">Thank you for your order!</p>
    <p style="margin:0 0 24px;font-size:14px;color:${MUTED_COLOR};">Order #${escapeHtml(String(order.violet_order_id))} &bull; ${new Date(order.created_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</p>
    ${bagsHtml}
    <div style="margin:24px 0;padding:16px;background:${BRAND_COLOR};border-radius:6px;">
      <p style="margin:0;color:#ffffff;font-size:18px;font-weight:600;text-align:right;">Total: ${formatCents(order.total, order.currency)}</p>
    </div>
    ${ctaButton("Track Your Order", trackingUrl)}
  `;

  return {
    from: Deno.env.get("EMAIL_FROM_ADDRESS") ?? "noreply@example.com",
    to: order.email,
    subject: `Order Confirmed — #${String(order.violet_order_id)}`,
    html: layout("Order Confirmed", content, appUrl),
  };
}

/**
 * Renders the "Bag Shipped" email — one email per bag when it ships.
 *
 * Includes: merchant name, shipped items, carrier/tracking info (if provided
 * by merchant via Violet), and CTA to track order.
 *
 * Trigger: BAG_SHIPPED webhook → processBagShipped in orderProcessors.ts.
 * Tracking info (tracking_number, tracking_url, carrier) is persisted from
 * the webhook payload before this email is sent.
 */
function renderBagShipped(order: OrderContext, bag: BagContext, appUrl: string): EmailPayload {
  const trackingUrl = getTrackingUrl(order, appUrl);
  const trackingInfo = bag.tracking_url
    ? `<p style="margin:16px 0;font-size:14px;">
        ${bag.carrier ? `Carrier: <strong>${escapeHtml(bag.carrier)}</strong> &bull; ` : ""}
        Tracking: <a href="${escapeHtml(bag.tracking_url)}" style="color:${ACCENT_COLOR};text-decoration:none;">${bag.tracking_number ? escapeHtml(bag.tracking_number) : "View tracking"}</a>
      </p>`
    : bag.tracking_number
      ? `<p style="margin:16px 0;font-size:14px;">${bag.carrier ? `Carrier: <strong>${escapeHtml(bag.carrier)}</strong> &bull; ` : ""}Tracking #: ${escapeHtml(bag.tracking_number)}</p>`
      : "";

  const content = `
    <p style="margin:0 0 16px;font-size:16px;">Great news — your items from <strong>${escapeHtml(bag.merchant_name)}</strong> have shipped!</p>
    <p style="margin:0 0 24px;font-size:14px;color:${MUTED_COLOR};">Order #${escapeHtml(String(order.violet_order_id))}</p>
    ${trackingInfo}
    <div style="margin:16px 0;padding:16px;background:#f8f9fa;border-radius:6px;">
      ${itemsTable(bag.order_items, order.currency)}
    </div>
    ${ctaButton("Track Your Order", trackingUrl)}
  `;

  return {
    from: Deno.env.get("EMAIL_FROM_ADDRESS") ?? "noreply@example.com",
    to: order.email,
    subject: `Your order has shipped — #${order.violet_order_id}`,
    html: layout("Order Shipped", content, appUrl),
  };
}

/**
 * Renders the "Bag Delivered" email — one email per bag on delivery confirmation.
 *
 * Includes: merchant name, delivered items, and CTA to view order.
 *
 * Trigger: BAG_COMPLETED webhook → processBagUpdated (when status=COMPLETED).
 * Note: Violet uses "COMPLETED" status for delivered bags, not a separate "DELIVERED" state.
 *
 * @see https://docs.violet.io/prism/checkout-guides/guides/order-and-bag-states.md
 */
function renderBagDelivered(order: OrderContext, bag: BagContext, appUrl: string): EmailPayload {
  const trackingUrl = getTrackingUrl(order, appUrl);

  const content = `
    <p style="margin:0 0 16px;font-size:16px;">Your items from <strong>${escapeHtml(bag.merchant_name)}</strong> have been delivered!</p>
    <p style="margin:0 0 24px;font-size:14px;color:${MUTED_COLOR};">Order #${escapeHtml(String(order.violet_order_id))}</p>
    <div style="margin:16px 0;padding:16px;background:#f8f9fa;border-radius:6px;">
      ${itemsTable(bag.order_items, order.currency)}
    </div>
    ${ctaButton("View Your Order", trackingUrl)}
  `;

  return {
    from: Deno.env.get("EMAIL_FROM_ADDRESS") ?? "noreply@example.com",
    to: order.email,
    subject: `Your order has been delivered — #${order.violet_order_id}`,
    html: layout("Order Delivered", content, appUrl),
  };
}

/**
 * Renders the "Refund Processed" email — sent when a bag is refunded.
 *
 * Includes: total refund amount (sum of all refund records for the bag),
 * merchant name, first available reason, refunded items, and a note about
 * the 5–10 business day timeline for the refund to appear in the buyer's account.
 *
 * Supports both full and partial refunds. Violet's Refund API allows multiple
 * partial refunds per bag (e.g., two items refunded separately). Each creates
 * a separate `order_refunds` row. This template sums them all and shows the
 * first non-null reason.
 *
 * Trigger: BAG_REFUNDED webhook → processBagRefunded → fetchAndStoreRefundDetails
 * → send-notification invocation (fire-and-forget).
 *
 * @see https://docs.violet.io/api-reference/orders-and-checkout/order-refunds/refund-bag.md — Refund API (partial + full)
 * @see https://docs.violet.io/api-reference/orders-and-checkout/order-cancellations/cancel-bag.md — Cancel vs Refund distinction
 */
function renderRefundProcessed(order: OrderContext, bag: BagContext, appUrl: string): EmailPayload {
  const trackingUrl = getTrackingUrl(order, appUrl);
  const totalRefunded = bag.order_refunds.reduce((sum, r) => sum + r.amount, 0);
  const firstReason = bag.order_refunds.find((r) => r.reason)?.reason;

  const content = `
    <p style="margin:0 0 16px;font-size:16px;">A refund has been processed for your order.</p>
    <p style="margin:0 0 24px;font-size:14px;color:${MUTED_COLOR};">Order #${escapeHtml(String(order.violet_order_id))}</p>
    <div style="margin:16px 0;padding:16px;background:rgba(39,174,96,0.06);border-left:3px solid ${SUCCESS_COLOR};border-radius:0 6px 6px 0;">
      <p style="margin:0;font-size:16px;font-weight:600;color:${SUCCESS_COLOR};">Refund: ${formatCents(totalRefunded, order.currency)}</p>
      <p style="margin:4px 0 0;font-size:14px;color:${MUTED_COLOR};">From: ${escapeHtml(bag.merchant_name)}</p>
      ${firstReason ? `<p style="margin:8px 0 0;font-size:13px;color:${MUTED_COLOR};">Reason: ${escapeHtml(firstReason)}</p>` : ""}
    </div>
    <div style="margin:16px 0;padding:16px;background:#f8f9fa;border-radius:6px;">
      ${itemsTable(bag.order_items, order.currency)}
    </div>
    <p style="margin:16px 0;font-size:14px;color:${MUTED_COLOR};">The refund should appear in your account within 5–10 business days, depending on your payment provider.</p>
    ${ctaButton("View Your Order", trackingUrl)}
  `;

  return {
    from: Deno.env.get("EMAIL_FROM_ADDRESS") ?? "noreply@example.com",
    to: order.email,
    subject: `Refund processed — #${order.violet_order_id}`,
    html: layout("Refund Processed", content, appUrl),
  };
}

// ─── Dispatcher ─────────────────────────────────────────────────────

/**
 * Routes a notification type to the appropriate email template renderer.
 *
 * All bag-level notifications (shipped, delivered, refund) require a non-null
 * `bag` parameter — throws if missing. Only `order_confirmed` renders without
 * a specific bag context (it includes all bags in the order).
 *
 * @param type - The notification type from the webhook processor
 * @param order - Full order context with nested bags, items, and refunds
 * @param bag - Specific bag context (null only for order_confirmed)
 * @param appUrl - Base URL for CTA links (from APP_URL env var)
 * @returns EmailPayload ready to send via Resend API
 * @throws If bag is null for a bag-level notification type
 */
export function renderEmail(
  type: NotificationType,
  order: OrderContext,
  bag: BagContext | null,
  appUrl: string,
): EmailPayload {
  switch (type) {
    case "order_confirmed":
      return renderOrderConfirmed(order, appUrl);
    case "bag_shipped": {
      if (!bag) throw new Error("bag_shipped requires a bag context");
      return renderBagShipped(order, bag, appUrl);
    }
    case "bag_delivered": {
      if (!bag) throw new Error("bag_delivered requires a bag context");
      return renderBagDelivered(order, bag, appUrl);
    }
    case "refund_processed": {
      if (!bag) throw new Error("refund_processed requires a bag context");
      return renderRefundProcessed(order, bag, appUrl);
    }
    default:
      throw new Error(`Unknown notification type: ${type}`);
  }
}
