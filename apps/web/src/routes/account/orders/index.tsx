/**
 * Order History List Page — /account/orders
 *
 * @module routes/account/orders/index
 *
 * Displays all of the authenticated buyer's orders in reverse chronological
 * order (FR24). Each card shows: date, total, overall status badge, and
 * merchant bag count. Clicking a card navigates to the order detail page.
 *
 * ## Data loading strategy
 * Uses a hybrid SSR + client-side approach:
 * 1. **Route loader** (SSR): Prefetches orders via `ensureQueryData` so the first
 *    render has data without a client-side round-trip. The loader calls `getOrdersFn`
 *    which queries Supabase (NOT Violet API directly).
 * 2. **useQuery** (CSR): Re-uses the same `ordersQueryOptions` for client-side
 *    cache management, background refetching, and stale-while-revalidate behavior.
 *
 * ## Platform adapter pattern
 * The `fetchOrders` wrapper adapts the TanStack Start server function signature
 * to the platform-agnostic `OrdersFetchFn` type from `@ecommerce/shared`. This
 * allows the same `ordersQueryOptions` to be used by both web (server functions)
 * and mobile (REST API calls to Supabase Edge Functions).
 *
 * ## Data source
 * Orders come from local Supabase tables (NOT Violet API). See server/orders.ts
 * module JSDoc for the rationale.
 *
 * ## Authentication
 * This route is nested under `/account/` which has an auth guard in its layout.
 * The server function also independently verifies authentication (defense-in-depth).
 *
 * ## UX states
 * - Loading: skeleton cards (not spinners) per UX spec
 * - Empty: CTA to browse products
 * - Error: message with retry button (clears stale cache before refetching)
 *
 * ## Known limitation: no pagination
 * All orders are fetched in a single request. For users with 100+ orders, this
 * could become slow. See orderHandlers.ts for pagination recommendations.
 *
 * @see {@link getOrdersFn} — server function that fetches orders
 * @see {@link ordersQueryOptions} — shared query options (web + mobile)
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ordersQueryOptions,
  ORDER_STATUS_LABELS,
  formatPrice,
  formatDate,
  queryKeys,
  buildPageMeta,
} from "@ecommerce/shared";
import { getOrdersFn } from "#/server/orders";
import type { OrderWithBagCount } from "@ecommerce/shared";

// Platform adapter: wrap TanStack Start Server Function as OrdersFetchFn
const fetchOrders = () => getOrdersFn();

const SITE_URL = process.env.SITE_URL ?? "http://localhost:3000";

export const Route = createFileRoute("/account/orders/")({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(ordersQueryOptions(fetchOrders));
  },
  component: OrdersPage,
  head: () => ({
    meta: buildPageMeta({
      title: "My Orders | Maison Émile",
      description: "View your order history and track deliveries.",
      url: "/account/orders",
      siteUrl: SITE_URL,
      noindex: true,
    }),
  }),
});

// ─── Formatters ───────────────────────────────────────────────────────────────

/**
 * Maps an order status to a BEM modifier class for the status badge.
 *
 * Status-to-color mapping:
 * - COMPLETED → "delivered" (green)
 * - SHIPPED/PARTIALLY_SHIPPED → "shipped" (blue)
 * - CANCELED/REFUNDED/PARTIALLY_REFUNDED → "canceled" (red/muted)
 * - All others (PROCESSING, IN_PROGRESS, etc.) → "processing" (neutral)
 *
 * Note: "PARTIALLY_SHIPPED" is a synthetic status derived by `deriveOrderStatusFromBags()`
 * when some bags are shipped but others are not. This status does not exist in Violet's
 * native order status enum.
 *
 * @param status - Order status from Supabase (may include synthetic states).
 * @returns BEM modifier class string for the status badge element.
 */
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

/**
 * Renders a single order card in the order history list.
 *
 * Displays: date, status badge, truncated order ID (first 8 chars of UUID),
 * merchant count, and formatted total. The entire card is a link to the
 * order detail page (`/account/orders/$orderId`).
 *
 * @param order - Order row with bag count from Supabase.
 */
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
