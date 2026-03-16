import { queryOptions } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import type { QueryClient } from "@tanstack/react-query";
import type { SupabaseClient, RealtimeChannel } from "@supabase/supabase-js";
import type { OrderRow, OrderBagRow, OrderItemRow } from "../types/orderPersistence.types.js";
import { queryKeys } from "../utils/constants.js";

// ─── Composite Types ──────────────────────────────────────────────────────────

/** Order from Supabase with merchant bag count for list display */
export type OrderWithBagCount = OrderRow & { bag_count: number };

/** Order bag with its line items for the detail view */
export type OrderBagWithItems = OrderBagRow & { order_items: OrderItemRow[] };

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
