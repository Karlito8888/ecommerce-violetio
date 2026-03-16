/**
 * Order Detail Page — /account/orders/:orderId
 *
 * @module routes/account/orders/$orderId
 *
 * Shows the full order with per-merchant bag tracking (FR25):
 * - Order header: ID (truncated UUID), date, overall status, total
 * - Per-merchant bags: merchant name, bag status, items with thumbnails
 * - Tracking link for SHIPPED bags (carrier + tracking number)
 * - Mixed bag state summary (e.g., "2 of 3 packages shipped")
 * - Refund notice for REFUNDED/PARTIALLY_REFUNDED bags
 * - Pricing breakdown: subtotal, shipping, tax, total
 * - Live status updates via Supabase Realtime (FR54)
 *
 * ## Data loading strategy
 * Hybrid SSR + client-side, same pattern as order list:
 * 1. **Route loader** (SSR): Prefetches via `ensureQueryData(orderDetailQueryOptions)`.
 *    The `orderId` param is a Supabase UUID (NOT Violet's numeric ID).
 * 2. **useQuery** (CSR): Re-uses `orderDetailQueryOptions` for cache management.
 * 3. **Realtime** (WebSocket): `useOrderRealtime` subscribes to Supabase Realtime
 *    channel `orders:user_{userId}`. On any UPDATE event, invalidates the TanStack
 *    Query cache which triggers an automatic re-fetch.
 *
 * ## Violet order status mapping
 * The `status` field on orders and bags comes from Violet's lifecycle:
 * - Order: IN_PROGRESS → PROCESSING → COMPLETED → CANCELED/REFUNDED/PARTIALLY_REFUNDED
 * - Bag: IN_PROGRESS → SUBMITTED → ACCEPTED → COMPLETED → SHIPPED → DELIVERED
 *   (with possible CANCELED/REFUNDED/PARTIALLY_REFUNDED/REJECTED/BACKORDERED)
 * We also derive synthetic states like "PARTIALLY_SHIPPED" when bags have mixed statuses.
 *
 * ## Authentication
 * Route is nested under `/account/` (auth guard in layout). Server function also
 * verifies authentication + RLS ensures user can only see their own order.
 *
 * @see {@link getOrderDetailFn} — server function that fetches the order
 * @see {@link useOrderRealtime} — Supabase Realtime subscription hook
 * @see {@link orderDetailQueryOptions} — shared query options (web + mobile)
 * @see https://docs.violet.io/prism/checkout-guides/carts-and-bags/carts/lifecycle-of-a-cart — Order lifecycle
 * @see https://docs.violet.io/prism/checkout-guides/guides/order-and-bag-states — Bag status states
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthSession } from "#/hooks/useAuthSession";
import { getSupabaseBrowserClient } from "#/utils/supabase";
import {
  orderDetailQueryOptions,
  useOrderRealtime,
  BAG_STATUS_LABELS,
  ORDER_STATUS_LABELS,
  getBagStatusSummary,
  formatPrice,
  formatDate,
} from "@ecommerce/shared";
import { getOrderDetailFn } from "#/server/orders";
import type { OrderBagWithItems, OrderItemRow, OrderRefundRow } from "@ecommerce/shared";

// Platform adapter: wrap TanStack Start Server Function as OrderDetailFetchFn
const fetchOrderDetail = (orderId: string) => getOrderDetailFn({ data: { orderId } });

export const Route = createFileRoute("/account/orders/$orderId")({
  loader: async ({ context, params }) => {
    await context.queryClient.ensureQueryData(
      orderDetailQueryOptions(params.orderId, fetchOrderDetail),
    );
  },
  component: OrderDetailPage,
});

// ─── Formatters ───────────────────────────────────────────────────────────────

/**
 * Maps a Violet bag status to a BEM modifier class for visual styling.
 *
 * Status-to-color mapping:
 * - COMPLETED → "delivered" (green)
 * - SHIPPED → "shipped" (blue)
 * - CANCELED/REFUNDED/PARTIALLY_REFUNDED → "canceled" (red/muted)
 * - All others (IN_PROGRESS, SUBMITTED, ACCEPTED, etc.) → "processing" (neutral)
 *
 * @param status - Bag fulfillment status from Supabase (originally from Violet).
 * @returns BEM modifier class string for the status badge element.
 */
function getBagStatusClass(status: string): string {
  switch (status) {
    case "COMPLETED":
      return "order-detail__status-badge--delivered";
    case "SHIPPED":
      return "order-detail__status-badge--shipped";
    case "CANCELED":
    case "REFUNDED":
    case "PARTIALLY_REFUNDED":
      return "order-detail__status-badge--canceled";
    default:
      return "order-detail__status-badge--processing";
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/**
 * Renders a single line item within a bag card.
 *
 * Displays thumbnail (or placeholder), item name, optional quantity badge,
 * and line price. The `line_price` is in integer cents (Violet convention)
 * and formatted by `formatPrice()`.
 *
 * @param item - Order item row from Supabase (persisted from Violet's SKU data).
 * @param currency - ISO 4217 currency code from the parent order.
 */
function ItemRow({ item, currency }: { item: OrderItemRow; currency: string }) {
  return (
    <div className="order-detail__item">
      {item.thumbnail ? (
        <img
          src={item.thumbnail}
          alt={item.name}
          className="order-detail__item-image"
          loading="lazy"
        />
      ) : (
        <div
          className="order-detail__item-image order-detail__item-image--placeholder"
          aria-hidden="true"
        >
          ●
        </div>
      )}
      <div className="order-detail__item-details">
        <div className="order-detail__item-name">{item.name}</div>
        {item.quantity > 1 && <div className="order-detail__item-qty">Qty: {item.quantity}</div>}
      </div>
      <div className="order-detail__item-price">{formatPrice(item.line_price, currency)}</div>
    </div>
  );
}

/**
 * Displays refund information for a bag that has been refunded.
 *
 * Per Violet.io docs, CANCELED bags never have refund data — only REFUNDED or
 * PARTIALLY_REFUNDED bags do. This component renders nothing for empty arrays,
 * which correctly handles CANCELED bags (they always have `order_refunds: []`).
 *
 * Amounts are in integer cents (Violet convention), formatted by `formatPrice`.
 *
 * @see https://docs.violet.io/prism/checkout-guides/guides/order-and-bag-states.md
 */
function RefundNotice({ refunds, currency }: { refunds: OrderRefundRow[]; currency: string }) {
  if (refunds.length === 0) return null;
  const totalRefunded = refunds.reduce((sum, r) => sum + r.amount, 0);
  const firstReason = refunds.find((r) => r.reason)?.reason;
  return (
    <div className="order-detail__refund">
      <span className="order-detail__refund-notice">
        Refund of {formatPrice(totalRefunded, currency)} processed
      </span>
      {firstReason && <span className="order-detail__refund-reason">{firstReason}</span>}
    </div>
  );
}

/**
 * Renders a single merchant bag card with items, tracking info, and refund notices.
 *
 * Each bag represents one merchant's fulfillment within the multi-merchant order.
 * Bags have independent statuses per Violet's model — e.g., one bag can be SHIPPED
 * while another is still ACCEPTED.
 *
 * Sections (conditionally rendered):
 * - Header: merchant name + status badge
 * - Line items: thumbnails, names, quantities, prices
 * - Tracking info: shown only for SHIPPED bags with a tracking URL
 * - Refund notice: shown only for bags with non-empty `order_refunds`
 * - Footer: shipping method + bag total (with refund annotation if applicable)
 *
 * @param bag - Bag row with nested items and refunds from Supabase.
 * @param orderCurrency - ISO 4217 currency code from the parent order.
 *
 * @see https://docs.violet.io/prism/checkout-guides/carts-and-bags/bags/states-of-a-bag — Bag status lifecycle
 */
function BagCard({ bag, orderCurrency }: { bag: OrderBagWithItems; orderCurrency: string }) {
  const statusLabel = BAG_STATUS_LABELS[bag.status] ?? bag.status;

  return (
    <div className="order-detail__bag">
      <div className="order-detail__bag-header">
        <span className="order-detail__merchant-name">{bag.merchant_name || "Merchant"}</span>
        <span className={`order-detail__status-badge ${getBagStatusClass(bag.status)}`}>
          {statusLabel}
        </span>
      </div>

      {/* Line items */}
      <div className="order-detail__items">
        {bag.order_items.map((item) => (
          <ItemRow key={item.id} item={item} currency={orderCurrency} />
        ))}
      </div>

      {/* Tracking info for SHIPPED bags */}
      {bag.status === "SHIPPED" && bag.tracking_url && (
        <div className="order-detail__tracking">
          {bag.carrier && <span className="order-detail__tracking-carrier">{bag.carrier}</span>}
          <a
            href={bag.tracking_url}
            target="_blank"
            rel="noopener noreferrer"
            className="order-detail__tracking-link"
          >
            Track Package →
          </a>
          {bag.tracking_number && (
            <span className="order-detail__tracking-number">#{bag.tracking_number}</span>
          )}
        </div>
      )}

      {/* Refund notice (REFUNDED bags only) */}
      <RefundNotice refunds={bag.order_refunds} currency={orderCurrency} />

      {/* Bag summary for mixed states — single bag so this applies within the order */}
      {bag.order_items.length > 0 && (
        <div className="order-detail__bag-footer">
          <span className="order-detail__bag-shipping-method">
            {bag.shipping_method && `Shipped via ${bag.shipping_method}`}
          </span>
          <span className="order-detail__bag-total">
            {formatPrice(bag.total, orderCurrency)}
            {bag.order_refunds.length > 0 && (
              <span className="order-detail__bag-refund-annotation">
                {` — Refund: ${formatPrice(
                  bag.order_refunds.reduce((s, r) => s + r.amount, 0),
                  orderCurrency,
                )}`}
              </span>
            )}
          </span>
        </div>
      )}
    </div>
  );
}

function OrderDetailSkeleton() {
  return (
    <div
      className="order-detail order-detail--skeleton"
      aria-label="Loading order"
      aria-busy="true"
    >
      <div className="order-detail__skeleton-header" aria-hidden="true" />
      <div className="order-detail__bag">
        <div className="orders__skeleton-line orders__skeleton-line--wide" />
        <div className="orders__skeleton-line orders__skeleton-line--medium" />
        <div className="orders__skeleton-line orders__skeleton-line--narrow" />
      </div>
    </div>
  );
}

// ─── Page Component ───────────────────────────────────────────────────────────

function OrderDetailPage() {
  const { orderId } = Route.useParams();
  const { user } = useAuthSession();
  const supabase = getSupabaseBrowserClient();
  const queryClient = useQueryClient();

  const {
    data: order,
    isLoading,
    isError,
    refetch,
  } = useQuery(orderDetailQueryOptions(orderId, fetchOrderDetail));

  // Realtime subscription for live status updates (FR54)
  useOrderRealtime(user?.id ?? null, queryClient, supabase);

  if (isLoading) return <OrderDetailSkeleton />;

  if (isError || !order) {
    return (
      <div className="page-wrap">
        <div className="order-detail">
          <Link to="/account/orders" className="order-detail__back">
            ← Back to Orders
          </Link>
          <div className="orders__error">
            <p className="orders__error-text">
              We couldn&apos;t load this order. Please try again.
            </p>
            <button type="button" className="orders__error-retry" onClick={() => void refetch()}>
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  const bagStatuses = order.order_bags.map((b) => b.status);
  const hasMultipleBags = order.order_bags.length > 1;
  const overallStatusLabel = ORDER_STATUS_LABELS[order.status] ?? order.status;

  return (
    <div className="page-wrap">
      <div className="order-detail">
        {/* Back navigation */}
        <Link to="/account/orders" className="order-detail__back">
          ← Back to Orders
        </Link>

        {/* Order header */}
        <header className="order-detail__header">
          <div className="order-detail__header-meta">
            <h1 className="order-detail__id">Order #{order.id.slice(0, 8).toUpperCase()}</h1>
            <time className="order-detail__date" dateTime={order.created_at}>
              {formatDate(order.created_at, "long")}
            </time>
          </div>
          <div className="order-detail__header-status">
            <span className="order-detail__overall-status">{overallStatusLabel}</span>
          </div>
        </header>

        {/* Mixed bag state summary (shown when multiple bags have different statuses) */}
        {hasMultipleBags && new Set(bagStatuses).size > 1 && (
          <div className="order-detail__bag-summary">
            {getBagStatusSummary(bagStatuses, "SHIPPED")}
          </div>
        )}

        {/* Per-merchant bags */}
        {order.order_bags.map((bag) => (
          <BagCard key={bag.id} bag={bag} orderCurrency={order.currency} />
        ))}

        {/* Pricing breakdown */}
        <div className="order-detail__pricing">
          <div className="order-detail__section-title">Order Summary</div>
          <div className="order-detail__pricing-row">
            <span>Subtotal</span>
            <span>{formatPrice(order.subtotal, order.currency)}</span>
          </div>
          <div className="order-detail__pricing-row">
            <span>Shipping</span>
            <span>{formatPrice(order.shipping_total, order.currency)}</span>
          </div>
          <div className="order-detail__pricing-row">
            <span>Tax</span>
            <span>{formatPrice(order.tax_total, order.currency)}</span>
          </div>
          <div className="order-detail__pricing-row order-detail__pricing-row--total">
            <span>Total</span>
            <span>{formatPrice(order.total, order.currency)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
