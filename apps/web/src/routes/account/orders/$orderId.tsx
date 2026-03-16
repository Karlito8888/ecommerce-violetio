/**
 * Order Detail Page — /account/orders/:orderId
 *
 * Shows the full order with per-merchant bag tracking (FR25):
 * - Order header: ID, date, overall status, total
 * - Per-merchant bags: merchant name, bag status, items with thumbnails
 * - Tracking link for SHIPPED bags (carrier + tracking number)
 * - Mixed bag state summary (e.g., "2 of 3 packages shipped")
 * - Pricing breakdown: subtotal, shipping, tax, total
 * - Live status updates via Supabase Realtime (FR54)
 *
 * ## SSR
 * Route loader prefetches order detail server-side via `ensureQueryData`.
 *
 * ## Realtime
 * `useOrderRealtime` subscribes to `orders:user_{userId}` channel.
 * On UPDATE event, invalidates TanStack Query cache → triggers re-fetch.
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
import type { OrderBagWithItems, OrderItemRow } from "@ecommerce/shared";

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

      {/* Bag summary for mixed states — single bag so this applies within the order */}
      {bag.order_items.length > 0 && (
        <div className="order-detail__bag-footer">
          <span className="order-detail__bag-shipping-method">
            {bag.shipping_method && `Shipped via ${bag.shipping_method}`}
          </span>
          <span className="order-detail__bag-total">{formatPrice(bag.total, orderCurrency)}</span>
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
