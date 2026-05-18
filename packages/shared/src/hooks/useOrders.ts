/**
 * Shared order hooks and query factories for authenticated order management.
 *
 * ## Purpose
 * Provides platform-agnostic TanStack Query options for the authenticated
 * user's order list and detail views. Used by checkout/confirmation flows.
 *
 * ## Architecture
 * Follows a "query options factory" pattern: functions return `queryOptions()`
 * objects (not hooks) so they can be used in both:
 * - Route loaders for SSR prefetching (web: `context.queryClient.ensureQueryData(...)`)
 * - Components via `useSuspenseQuery(ordersQueryOptions(...))`
 *
 * Platform-specific data fetching is injected via callback parameters
 * (`OrdersFetchFn`, `OrderDetailFetchFn`), keeping this module decoupled
 * from server functions or edge function specifics.
 *
 * ## Realtime — CONVEX
 * Convex queries are reactive by default. No manual Realtime subscription needed.
 * When data changes (via mutation), all connected clients are notified automatically.
 * The Supabase Realtime hooks (`useOrderRealtime`, `createOrdersRealtimeChannel`)
 * have been removed — they are unnecessary with Convex.
 *
 * @module useOrders
 * @see {@link file://apps/web/src/routes/account/orders/index.tsx} — web consumer (Convex)
 * @see {@link file://apps/mobile/src/app/orders/index.tsx} — mobile consumer (Convex)
 */

import { queryOptions } from "@tanstack/react-query";
import type {
  OrderRow,
  OrderBagRow,
  OrderItemRow,
  OrderRefundRow,
} from "../types/orderPersistence.types.js";
import { queryKeys } from "../utils/constants.js";

// ─── Composite Types ──────────────────────────────────────────────────────────

/** Order from Supabase with merchant bag count for list display */
export type OrderWithBagCount = OrderRow & { bag_count: number };

/**
 * Order bag with its line items and refunds for the detail view.
 *
 * `order_refunds` is always an array (never null) — Supabase nested selects
 * return `[]` when no related rows exist. CANCELED bags without a refund
 * will always have `order_refunds: []`, so no refund UI renders for them.
 * This aligns with Violet's distinction: CANCELED ≠ REFUNDED.
 *
 * @see https://docs.violet.io/prism/checkout-guides/guides/order-and-bag-states.md
 */
export type OrderBagWithItems = OrderBagRow & {
  order_items: OrderItemRow[];
  order_refunds: OrderRefundRow[];
};

/** Full order from Supabase with nested bags and items for detail display */
export type OrderWithBagsAndItems = OrderRow & { order_bags: OrderBagWithItems[] };

// ─── Platform-Agnostic Fetch Function Types ───────────────────────────────────

/**
 * Function signature for fetching the authenticated user's order list.
 *
 * Platform-specific implementations:
 * - **Web**: passes a TanStack Start Server Function (`getOrdersFn`)
 * - **Mobile**: will pass a Supabase Edge Function call (future story)
 */
export type OrdersFetchFn = () => Promise<OrderWithBagCount[]>;

/**
 * Function signature for fetching a single order with bags and items.
 *
 * Same platform-agnostic pattern as {@link OrdersFetchFn}.
 */
export type OrderDetailFetchFn = (orderId: string) => Promise<OrderWithBagsAndItems | null>;

// ─── Query Options Factories ──────────────────────────────────────────────────

/**
 * Creates TanStack Query options for the authenticated user's order list.
 *
 * Returns a `queryOptions` object (not a hook) so it can be used in both:
 * - Route loaders for SSR prefetching (`context.queryClient.ensureQueryData(...)`)
 * - Components via `useSuspenseQuery(ordersQueryOptions(...))`
 *
 * Query key: `['orders', 'list', undefined]` — defined in `queryKeys.orders.list()`
 *
 * @param fetchFn - Platform-specific fetch function (Server Function on web)
 */
export function ordersQueryOptions(fetchFn: OrdersFetchFn) {
  return queryOptions({
    queryKey: queryKeys.orders.list(),
    queryFn: fetchFn,
  });
}

/**
 * Creates TanStack Query options for a single order detail page.
 *
 * Query key: `['orders', 'detail', orderId]`
 *
 * @param orderId - Supabase order UUID
 * @param fetchFn - Platform-specific fetch function
 */
export function orderDetailQueryOptions(orderId: string, fetchFn: OrderDetailFetchFn) {
  return queryOptions({
    queryKey: queryKeys.orders.detail(orderId),
    queryFn: () => fetchFn(orderId),
  });
}
