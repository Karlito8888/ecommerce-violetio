/**
 * Order Detail Page — /account/orders/:orderId
 *
 * Migrated from Supabase to Convex queries (Phase 5).
 * Uses shared ConvexOrder types (m1 fix) and #convex path alias (M5 fix).
 * Order ownership is verified server-side in getOrderDetail (M2 fix).
 *
 * Protected by the /account layout auth guard (Convex Auth).
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "#convex/_generated/api";
import type { Id } from "#convex/_generated/dataModel";
import {
  BAG_STATUS_LABELS,
  ORDER_STATUS_LABELS,
  getBagStatusSummary,
  formatPrice,
  formatDate,
  buildPageMeta,
} from "@ecommerce/shared";
import type { ConvexOrderBag, ConvexOrderItem, ConvexOrderRefund } from "#/types/convexOrders";

const SITE_URL = process.env.SITE_URL ?? "http://localhost:3000";

export const Route = createFileRoute("/account/orders/$orderId")({
  component: OrderDetailPage,
  head: () => ({
    meta: buildPageMeta({
      title: "Order Details | Maison Émile",
      description: "View order details and tracking information.",
      url: "/account/orders",
      siteUrl: SITE_URL,
      noindex: true,
    }),
  }),
});

// ─── Status helpers ──────────────────────────────────────────────────────────

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

function ItemRow({ item, currency }: { item: ConvexOrderItem; currency: string }) {
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
      <div className="order-detail__item-price">{formatPrice(item.linePrice, currency)}</div>
    </div>
  );
}

function RefundNotice({ refunds, currency }: { refunds: ConvexOrderRefund[]; currency: string }) {
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

function BagCard({ bag, orderCurrency }: { bag: ConvexOrderBag; orderCurrency: string }) {
  const statusLabel = BAG_STATUS_LABELS[bag.status] ?? bag.status;

  return (
    <div className="order-detail__bag">
      <div className="order-detail__bag-header">
        <span className="order-detail__merchant-name">{bag.merchantName || "Merchant"}</span>
        <span className={`order-detail__status-badge ${getBagStatusClass(bag.status)}`}>
          {statusLabel}
        </span>
      </div>

      <div className="order-detail__items">
        {bag.items.map((item, idx) => (
          <ItemRow key={idx} item={item} currency={orderCurrency} />
        ))}
      </div>

      {bag.status === "SHIPPED" && bag.trackingUrl && (
        <div className="order-detail__tracking">
          {bag.carrier && <span className="order-detail__tracking-carrier">{bag.carrier}</span>}
          <a
            href={bag.trackingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="order-detail__tracking-link"
          >
            Track Package →
          </a>
          {bag.trackingNumber && (
            <span className="order-detail__tracking-number">#{bag.trackingNumber}</span>
          )}
        </div>
      )}

      <RefundNotice refunds={bag.refunds} currency={orderCurrency} />

      {bag.items.length > 0 && (
        <div className="order-detail__bag-footer">
          <span className="order-detail__bag-shipping-method">
            {bag.shippingMethod && `Shipped via ${bag.shippingMethod}`}
          </span>
          <span className="order-detail__bag-total">
            {formatPrice(bag.total, orderCurrency)}
            {bag.refunds.length > 0 && (
              <span className="order-detail__bag-refund-annotation">
                {` — Refund: ${formatPrice(
                  bag.refunds.reduce((s, r) => s + r.amount, 0),
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
  const { orderId } = Route.useParams() as { orderId: string };

  // Convex query for order detail (ownership checked server-side — M2 fix)
  const order = useQuery(api.orders.queries.getOrderDetail, {
    orderId: orderId as Id<"orders">,
  });

  const isLoading = order === undefined;

  if (isLoading) return <OrderDetailSkeleton />;

  if (!order) {
    return (
      <div className="page-wrap">
        <div className="order-detail">
          <Link to="/account/orders" className="order-detail__back">
            ← Back to Orders
          </Link>
          <div className="orders__error">
            <p className="orders__error-text">Order not found.</p>
          </div>
        </div>
      </div>
    );
  }

  const bags = order.bags ?? [];
  const bagStatuses = bags.map((b: ConvexOrderBag) => b.status);
  const hasMultipleBags = bags.length > 1;
  const overallStatusLabel = ORDER_STATUS_LABELS[order.status] ?? order.status;

  return (
    <div className="page-wrap">
      <div className="order-detail">
        <Link to="/account/orders" className="order-detail__back">
          ← Back to Orders
        </Link>

        <header className="order-detail__header">
          <div className="order-detail__header-meta">
            <h1 className="order-detail__id">
              Order #{order.violetOrderId.slice(0, 8).toUpperCase()}
            </h1>
            <time
              className="order-detail__date"
              dateTime={new Date(order._creationTime).toISOString()}
            >
              {formatDate(new Date(order._creationTime).toISOString(), "long")}
            </time>
          </div>
          <div className="order-detail__header-status">
            <span className="order-detail__overall-status">{overallStatusLabel}</span>
          </div>
        </header>

        {hasMultipleBags && new Set(bagStatuses).size > 1 && (
          <div className="order-detail__bag-summary">
            {getBagStatusSummary(bagStatuses, "SHIPPED")}
          </div>
        )}

        {bags.map((bag: ConvexOrderBag) => (
          <BagCard key={bag._id} bag={bag} orderCurrency={order.currency} />
        ))}

        <div className="order-detail__pricing">
          <div className="order-detail__section-title">Order Summary</div>
          <div className="order-detail__pricing-row">
            <span>Subtotal</span>
            <span>{formatPrice(order.subtotal, order.currency)}</span>
          </div>
          <div className="order-detail__pricing-row">
            <span>Shipping</span>
            <span>{formatPrice(order.shippingTotal, order.currency)}</span>
          </div>
          <div className="order-detail__pricing-row">
            <span>Tax</span>
            <span>{formatPrice(order.taxTotal, order.currency)}</span>
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
