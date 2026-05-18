/**
 * Order History List Page — /account/orders
 *
 * Migrated from Supabase to Convex queries (Phase 5).
 * Uses shared ConvexOrder types (m1 fix) and #convex path alias (M5 fix).
 * Supports pagination via optional `limit` arg (M1 fix).
 *
 * Protected by the /account layout auth guard (Convex Auth).
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useConvexAuth } from "convex/react";
import { api } from "#convex/_generated/api";
import { buildPageMeta, formatPrice, formatDate, ORDER_STATUS_LABELS } from "@ecommerce/shared";
import type { ConvexOrder } from "#/types/convexOrders";

const SITE_URL = process.env.SITE_URL ?? "http://localhost:3000";

export const Route = createFileRoute("/account/orders/")({
  head: () => ({
    meta: buildPageMeta({
      title: "My Orders | Maison Émile",
      description: "View your order history and track deliveries.",
      url: "/account/orders",
      siteUrl: SITE_URL,
      noindex: true,
    }),
  }),
  component: OrdersPage,
});

/** Maps an order status to a BEM modifier class for the status badge. */
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
  const { isAuthenticated } = useConvexAuth();
  const identity = useQuery(api.users.queries.getIdentity, isAuthenticated ? {} : "skip");
  const userId = identity?.subject ?? "";

  // Convex query for orders (reactive by default, bounded to 50)
  const orders = useQuery(api.orders.queries.getOrders, userId ? { userId } : "skip");

  const isLoading = orders === undefined;
  const isError = orders instanceof Error;

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
                {orders.map((order: ConvexOrder) => {
                  const statusLabel = ORDER_STATUS_LABELS[order.status] ?? order.status;
                  const bagCount = order.bags?.length ?? 0;
                  const merchantText = bagCount === 1 ? "1 merchant" : `${bagCount} merchants`;

                  return (
                    <Link
                      key={order._id}
                      to="/account/orders/$orderId"
                      params={{ orderId: order._id }}
                      className="orders__card"
                    >
                      <div className="orders__card-header">
                        <span className="orders__card-date">
                          {formatDate(new Date(order._creationTime).toISOString(), "short")}
                        </span>
                        <span className={`orders__status-badge ${getStatusClass(order.status)}`}>
                          {statusLabel}
                        </span>
                      </div>
                      <div className="orders__card-meta">
                        <span className="orders__card-id">
                          Order #{order.violetOrderId.slice(0, 8).toUpperCase()}
                        </span>
                        <span className="orders__card-merchants">{merchantText}</span>
                      </div>
                      <div className="orders__card-total">
                        {formatPrice(order.total, order.currency)}
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
