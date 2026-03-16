/**
 * Order Server Functions — TanStack Start RPC wrappers.
 *
 * ## Data source
 * These functions query the Supabase `orders`, `order_bags`, and `order_items`
 * tables — the local mirror populated by Story 5.1 (persistence) and kept
 * up-to-date by Story 5.2 (webhooks). Do NOT call Violet's GET /orders endpoint
 * — that would bypass RLS and introduce unnecessary latency.
 *
 * ## Security
 * Uses `getSupabaseSessionClient()` (anon key + user JWT from cookies) so that
 * Supabase Row Level Security applies automatically. The `users_read_own_orders`
 * RLS policy ensures users only see their own orders.
 *
 * ## Client bundle safety
 *
 * Handler logic lives in orderHandlers.ts and is loaded via dynamic import INSIDE
 * each .handler() closure. TanStack Start removes the .handler() body from the
 * client bundle, taking the dynamic import with it — so getSupabaseSessionClient
 * (which imports @tanstack/react-start/server via supabaseServer.ts) never reaches
 * the client build.
 */

import { createServerFn } from "@tanstack/react-start";
import type { OrderWithBagsAndItems } from "@ecommerce/shared";

// ─── Server Functions (TanStack Start RPC wrappers) ───────────────────────────

/**
 * Server Function — fetches authenticated user's order history in reverse
 * chronological order (FR24). Returns each order with a `bag_count` field.
 */
export const getOrdersFn = createServerFn({ method: "GET" }).handler(async () => {
  const { ordersHandler } = await import("./orderHandlers");
  return ordersHandler();
});

/**
 * Server Function — fetches a single order with all merchant bags and items.
 * RLS (`users_read_own_orders`) ensures only the owner can access their order.
 *
 * @param orderId - Supabase order UUID (NOT the Violet order ID)
 */
export const getOrderDetailFn = createServerFn({ method: "GET" })
  .inputValidator((data: { orderId: string }) => data)
  .handler(async ({ data }): Promise<OrderWithBagsAndItems | null> => {
    const { orderDetailHandler } = await import("./orderHandlers");
    return orderDetailHandler(data.orderId);
  });
