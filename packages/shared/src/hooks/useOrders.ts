/**
 * Shared order hooks and query factories for authenticated order management.
 *
 * ## Purpose
 * Provides platform-agnostic TanStack Query options and Supabase Realtime
 * subscriptions for the authenticated user's order list and detail views.
 * Used by the web app's account/orders pages. Mobile does not yet consume
 * these hooks (confirmation and guest lookup use direct fetch calls).
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
 * ## Realtime
 * The `useOrderRealtime` hook subscribes to Supabase Realtime for live order
 * and bag status changes, using cache invalidation (not state patching) to
 * keep the UI fresh.
 *
 * ## Mobile integration status
 * - The `OrderConfirmationScreen` (mobile) does NOT use these hooks — it performs
 *   a one-shot fetch because confirmation is transient.
 * - The `GuestLookupScreen` (mobile) does NOT use these hooks — guest data comes
 *   from a different Edge Function with snake_case types.
 * - Future mobile order list/detail screens SHOULD use `ordersQueryOptions()` and
 *   `orderDetailQueryOptions()` with a mobile-specific fetch function.
 *
 * @module useOrders
 * @see {@link file://apps/web/src/routes/account/orders/index.tsx} — web consumer
 * @see {@link file://apps/mobile/src/app/order/[orderId]/confirmation.tsx} — does NOT use this
 * @see {@link file://apps/mobile/src/app/order/lookup.tsx} — does NOT use this
 */

import { queryOptions } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import type { QueryClient } from "@tanstack/react-query";
import type { SupabaseClient, RealtimeChannel } from "@supabase/supabase-js";
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

// ─── Realtime Subscription Logic ─────────────────────────────────────────────

/**
 * Creates and subscribes to a Supabase Realtime channel for live order status updates.
 *
 * ## Architecture
 * Realtime is used as a **cache-invalidation signal**, NOT for patching state.
 * When an UPDATE event arrives, we invalidate `queryKeys.orders.all()` and let
 * TanStack Query re-fetch from Supabase. This is safe because:
 * - REPLICA IDENTITY DEFAULT only sends the PK on UPDATE (not full row)
 * - Re-fetching always gets the latest data, including RLS-protected rows
 * - Spurious invalidations cause harmless re-fetches
 *
 * ## Channel convention
 * `orders:user_{userId}` — from architecture.md.
 *
 * ## order_bags filter limitation
 * `order_bags` has no `user_id` column, so we cannot filter by user. We subscribe
 * to all `order_bags` UPDATEs — the re-fetch is RLS-protected so only the user's
 * data is returned. At worst, a spurious invalidation triggers a harmless re-fetch.
 *
 * Extracted as a pure function so it can be unit-tested without React.
 *
 * @returns The subscribed RealtimeChannel (call `.unsubscribe()` to clean up).
 */
export function createOrdersRealtimeChannel(
  supabase: SupabaseClient,
  userId: string,
  queryClient: QueryClient,
): RealtimeChannel {
  return supabase
    .channel(`orders:user_${userId}`)
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "orders",
        filter: `user_id=eq.${userId}`,
      },
      () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.orders.all() });
      },
    )
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "order_bags",
      },
      () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.orders.all() });
      },
    )
    .subscribe();
}

// ─── Realtime Subscription Hook ───────────────────────────────────────────────

/**
 * React hook that subscribes to Supabase Realtime for live order status updates.
 * Delegates channel setup to {@link createOrdersRealtimeChannel} (pure, testable).
 *
 * @param userId - Authenticated user ID. Pass `null` to disable subscription.
 * @param queryClient - TanStack Query client for cache invalidation.
 * @param supabase - Browser Supabase client (NOT service-role).
 */
export function useOrderRealtime(
  userId: string | null,
  queryClient: QueryClient,
  supabase: SupabaseClient,
): void {
  const channelRef = useRef<RealtimeChannel | null>(null);

  // Stabilize queryClient ref to avoid re-subscribing on every render
  const queryClientRef = useRef(queryClient);
  queryClientRef.current = queryClient;

  useEffect(() => {
    if (!userId) return;

    const channel = createOrdersRealtimeChannel(supabase, userId, queryClientRef.current);
    channelRef.current = channel;

    return () => {
      channel.unsubscribe();
      channelRef.current = null;
    };
  }, [supabase, userId]);
}
