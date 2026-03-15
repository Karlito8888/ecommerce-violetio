/**
 * Order Confirmation Page — the "Post-Purchase Wow Moment".
 *
 * ## Architecture
 * This page uses a TanStack Start `loader` to fetch order data SSR — unlike the
 * checkout page (which is CSR because Stripe.js is client-side only), the confirmation
 * page has no client-side payment dependency and benefits from server-side rendering
 * for faster first paint and bookmarkable/shareable URLs.
 *
 * ## Editorial warmth mode (from UX spec)
 * The checkout uses "search-forward" mode (efficiency, Inter font). The confirmation
 * switches to "editorial" mode (Cormorant Garamond headline, generous whitespace,
 * success accents) to create the "quiet luxury" emotional payoff.
 *
 * ## Data source
 * Fetches from Violet GET /orders/{id} via `getOrderDetailsFn`. The order exists
 * in Violet's system after POST /checkout/cart/{id}/submit. The `orderId` comes
 * from the submit response and is passed via the URL parameter.
 *
 * @see https://docs.violet.io/api-reference/orders-and-checkout/orders/get-order-by-id
 * @see Story 4.5 — Payment Confirmation & 3D Secure Handling
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { formatPrice } from "@ecommerce/shared";
import { getOrderDetailsFn } from "#/server/checkout";
import type { OrderDetail, OrderBag } from "@ecommerce/shared";

export const Route = createFileRoute("/order/$orderId/confirmation")({
  /**
   * SSR loader — fetches order details server-side for fast first paint.
   * The orderId is the Violet order ID returned by POST /submit (Story 4.4).
   */
  loader: async ({ params }) => {
    return getOrderDetailsFn({ data: { orderId: params.orderId } });
  },
  component: OrderConfirmation,
});

/**
 * Formats an ISO 8601 date string into a human-readable date.
 * Falls back gracefully if the date is invalid.
 */
function formatDate(isoDate?: string): string {
  if (!isoDate) return "";
  try {
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(isoDate));
  } catch {
    return isoDate;
  }
}

function OrderConfirmation() {
  const result = Route.useLoaderData();

  // Error state — order not found or Violet API error
  if (result.error || !result.data) {
    return (
      <div className="page-wrap">
        <div className="confirmation__error">
          <h1 className="confirmation__error-heading">Order Not Found</h1>
          <p className="confirmation__error-text">
            {result.error?.message ?? "We couldn't find this order. It may still be processing."}
          </p>
          <Link to="/" className="confirmation__cta">
            Continue Shopping
          </Link>
        </div>
      </div>
    );
  }

  const order: OrderDetail = result.data;

  return (
    <div className="page-wrap">
      <div className="confirmation" role="main" aria-label="Order confirmation">
        {/* ── Header: success + heading ── */}
        <header className="confirmation__header" aria-live="polite">
          <div className="confirmation__icon" aria-hidden="true">
            ✓
          </div>
          <h1 className="confirmation__heading">Order Confirmed</h1>
          <p className="confirmation__subheading">
            Thank you for your purchase. Your order has been placed successfully.
          </p>
        </header>

        {/* ── Order metadata ── */}
        <div className="confirmation__meta">
          <span>
            <span className="confirmation__meta-label">Order</span>#{order.id}
          </span>
          {order.dateSubmitted && (
            <span>
              <span className="confirmation__meta-label">Placed</span>
              {formatDate(order.dateSubmitted)}
            </span>
          )}
        </div>

        {/* ── Per-merchant bag cards ── */}
        {order.bags.map((bag) => (
          <BagCard key={bag.id} bag={bag} currency={order.currency} />
        ))}

        {/* ── Price breakdown ── */}
        <div className="confirmation__pricing">
          <div className="confirmation__section-title">Order Summary</div>
          <div className="confirmation__pricing-row">
            <span>Subtotal</span>
            <span>{formatPrice(order.subtotal, order.currency)}</span>
          </div>
          <div className="confirmation__pricing-row">
            <span>Shipping</span>
            <span>{formatPrice(order.shippingTotal, order.currency)}</span>
          </div>
          <div className="confirmation__pricing-row">
            <span>Tax</span>
            <span>{formatPrice(order.taxTotal, order.currency)}</span>
          </div>
          <div className="confirmation__pricing-row confirmation__pricing-row--total">
            <span>Total</span>
            <span>{formatPrice(order.total, order.currency)}</span>
          </div>
        </div>

        {/* ── Shipping address ── */}
        <div className="confirmation__address">
          <div className="confirmation__section-title">Shipping Address</div>
          <p className="confirmation__address-text">
            {order.customer.firstName} {order.customer.lastName}
            <br />
            {order.shippingAddress.address1}
            <br />
            {order.shippingAddress.city}, {order.shippingAddress.state}{" "}
            {order.shippingAddress.postalCode}
            <br />
            {order.shippingAddress.country}
          </p>
        </div>

        {/* ── Actions ── */}
        <div className="confirmation__actions">
          <Link to="/" className="confirmation__cta">
            Continue Shopping
          </Link>
          <p className="confirmation__tracking-hint">
            Order tracking will be available once your items ship.
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * BagCard — renders a single merchant bag with its items.
 *
 * Each bag represents one merchant's items within the order. Violet's Cart/Bag
 * model means bags can have independent statuses (ACCEPTED, REJECTED, etc.)
 * which is why we show a per-bag status badge.
 */
function BagCard({ bag, currency }: { bag: OrderBag; currency: string }) {
  return (
    <div className="confirmation__bag">
      <div className="confirmation__bag-header">
        <span className="confirmation__merchant-name">{bag.merchantName || "Merchant"}</span>
        <span className="confirmation__bag-status">{bag.status || "Processing"}</span>
      </div>

      {bag.items.map((item) => (
        <div key={item.skuId} className="confirmation__item">
          {item.thumbnail ? (
            <img
              src={item.thumbnail}
              alt={item.name}
              className="confirmation__item-image"
              loading="lazy"
            />
          ) : (
            <div className="confirmation__item-image--placeholder" aria-hidden="true">
              ●
            </div>
          )}
          <div className="confirmation__item-details">
            <div className="confirmation__item-name">{item.name}</div>
            {item.quantity > 1 && (
              <div className="confirmation__item-qty">Qty: {item.quantity}</div>
            )}
          </div>
          <div className="confirmation__item-price">{formatPrice(item.linePrice, currency)}</div>
        </div>
      ))}

      {bag.shippingMethod && (
        <div className="confirmation__bag-shipping">
          <span className="confirmation__bag-shipping-label">
            {bag.shippingMethod.carrier} — {bag.shippingMethod.label}
          </span>
          <span>{formatPrice(bag.shippingTotal, currency)}</span>
        </div>
      )}
    </div>
  );
}
