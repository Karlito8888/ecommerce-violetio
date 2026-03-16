/**
 * Order History List Page — /account/orders
 *
 * Displays all of the authenticated buyer's orders in reverse chronological
 * order (FR24). Each card shows: date, total, overall status badge, and
 * merchant bag count. Clicking a card navigates to the order detail page.
 *
 * ## SSR
 * The route loader prefetches orders server-side via `ensureQueryData` so
 * the first render has data without a client-side round-trip.
 *
 * ## UX
 * - Loading: skeleton cards (not spinners) per UX spec
 * - Empty: CTA to browse products
 * - Error: message with retry button
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ordersQueryOptions,
  ORDER_STATUS_LABELS,
  formatPrice,
  formatDate,
  queryKeys,
} from "@ecommerce/shared";
import { getOrdersFn } from "#/server/orders";
import type { OrderWithBagCount } from "@ecommerce/shared";

// Platform adapter: wrap TanStack Start Server Function as OrdersFetchFn
const fetchOrders = () => getOrdersFn();

export const Route = createFileRoute("/account/orders/")({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(ordersQueryOptions(fetchOrders));
  },
  component: OrdersPage,
});

// ─── Formatters ───────────────────────────────────────────────────────────────

function getStatusClass(status: string): string {
  switch (status) {
    case "COMPLETED":
      return "orders__status-badge--delivered";
    case "SHIPPED":
    case "PARTIALLY_SHIPPED":
      return "orders__status-badge--shipped";
    case "CANCELED":
    case "REFUNDED":
    case "PARTIALLY_REFUNDED":
      return "orders__status-badge--canceled";
    default:
      return "orders__status-badge--processing";
  }
}

// ─── Components ───────────────────────────────────────────────────────────────

function OrderCard({ order }: { order: OrderWithBagCount }) {
  const statusLabel = ORDER_STATUS_LABELS[order.status] ?? order.status;
  const merchantText = order.bag_count === 1 ? "1 merchant" : `${order.bag_count} merchants`;

  return (
    <Link to="/account/orders/$orderId" params={{ orderId: order.id }} className="orders__card">
      <div className="orders__card-header">
        <span className="orders__card-date">{formatDate(order.created_at, "short")}</span>
        <span className={`orders__status-badge ${getStatusClass(order.status)}`}>
          {statusLabel}
        </span>
      </div>
      <div className="orders__card-meta">
        <span className="orders__card-id">Order #{order.id.slice(0, 8).toUpperCase()}</span>
        <span className="orders__card-merchants">{merchantText}</span>
      </div>
      <div className="orders__card-total">{formatPrice(order.total, order.currency)}</div>
    </Link>
  );
}

function OrderListSkeleton() {
  return (
    <div className="orders__list" aria-label="Loading orders" aria-busy="true">
      {[1, 2, 3].map((i) => (
        <div key={i} className="orders__card orders__card--skeleton" aria-hidden="true">
          <div className="orders__skeleton-line orders__skeleton-line--wide" />
          <div className="orders__skeleton-line orders__skeleton-line--narrow" />
          <div className="orders__skeleton-line orders__skeleton-line--medium" />
        </div>
      ))}
    </div>
  );
}

function OrdersPage() {
  const queryClient = useQueryClient();
  const { data: orders, isLoading, isError, refetch } = useQuery(ordersQueryOptions(fetchOrders));

  return (
    <div className="page-wrap">
      <div className="orders">
        <h1 className="orders__heading">My Orders</h1>

        {isLoading && <OrderListSkeleton />}

        {isError && (
          <div className="orders__error">
            <p className="orders__error-text">
              We couldn&apos;t load your orders. Please try again.
            </p>
            <button
              type="button"
              className="orders__error-retry"
              onClick={() => {
                queryClient.removeQueries({ queryKey: queryKeys.orders.all() });
                void refetch();
              }}
            >
              Retry
            </button>
          </div>
        )}

        {!isLoading && !isError && orders && (
          <>
            {orders.length === 0 ? (
              <div className="orders__empty">
                <p className="orders__empty-text">You haven&apos;t placed any orders yet.</p>
                <Link
                  to="/products"
                  search={{
                    category: undefined,
                    minPrice: undefined,
                    maxPrice: undefined,
                    inStock: undefined,
                    sortBy: undefined,
                    sortDirection: undefined,
                  }}
                  className="orders__empty-cta"
                >
                  Browse Products
                </Link>
              </div>
            ) : (
              <div className="orders__list">
                {orders.map((order) => (
                  <OrderCard key={order.id} order={order} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
