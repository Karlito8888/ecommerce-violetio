// packages/shared/src/hooks/convex/useOrders.ts
//
// Convex-based order hooks.
// Replaces the Supabase-based useOrders.ts during migration.
//
// Key advantage: Convex queries are reactive by default.
// No need for useOrderRealtime() or Supabase Realtime channels.

import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

/**
 * Reactive orders list for a user, with bags + items + refunds.
 * Auto-updates when data changes (no Realtime subscription needed).
 */
export function useOrdersConvex(userId: string | undefined) {
  return useQuery(api.orders.queries.getOrders, userId ? { userId } : "skip");
}

/**
 * Reactive order detail with bags, items, and refunds.
 */
export function useOrderDetailConvex(orderId: Id<"orders"> | undefined) {
  return useQuery(api.orders.queries.getOrderDetail, orderId ? { orderId } : "skip");
}

/**
 * Guest order lookup by token hash (no auth required).
 */
export function useGuestOrderByToken(tokenHash: string | undefined) {
  return useQuery(
    api.orders.queries.getGuestOrderByToken,
    tokenHash ? { orderLookupTokenHash: tokenHash } : "skip",
  );
}
