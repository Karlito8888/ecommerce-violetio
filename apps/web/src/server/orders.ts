/**
 * Order Server Functions — TanStack Start RPC wrappers.
 *
 * @module server/orders
 *
 * ## Data source
 * These functions query the Supabase `orders`, `order_bags`, and `order_items`
 * tables — the local mirror populated by Story 5.1 (persistence) and kept
 * up-to-date by Story 5.2 (webhooks). Do NOT call Violet's GET /orders endpoint
 * — that would bypass RLS and introduce unnecessary latency.
 *
 * ## Why Supabase instead of Violet GET /orders?
 * Violet's GET /orders endpoint returns all orders for the app_id (no per-user
 * filtering), and its POST /orders/search endpoint only filters by `bag_status`.
 * Neither supports per-user scoping — we'd need to fetch all orders and filter
 * client-side, which is unacceptable for security and performance. Our Supabase
 * mirror with RLS provides per-user scoping at the database level.
 *
 * ## Security
 * Uses `getSupabaseSessionClient()` (anon key + user JWT from cookies) so that
 * Supabase Row Level Security applies automatically. The `users_read_own_orders`
 * RLS policy ensures users only see their own orders.
 *
 * ## Client bundle safety
 * Handler logic lives in orderHandlers.ts and is loaded via dynamic import INSIDE
 * each .handler() closure. TanStack Start removes the .handler() body from the
 * client bundle, taking the dynamic import with it — so getSupabaseSessionClient
 * (which imports @tanstack/react-start/server via supabaseServer.ts) never reaches
 * the client build.
 *
 * ## Data flow
 * ```
 * Violet API (webhooks) → Supabase (orders/order_bags/order_items tables)
 *                          ↓ (RLS-protected queries)
 *                        orderHandlers.ts (server-only logic)
 *                          ↓ (dynamic import inside .handler())
 *                        orders.ts (TanStack Start RPC wrappers) → Client
 * ```
 *
 * @see {@link ordersHandler} — core logic for order list fetching
 * @see {@link orderDetailHandler} — core logic for single order detail
 * @see https://docs.violet.io/api-reference/orders-and-checkout/orders/get-orders — Violet GET /orders (NOT used; see rationale above)
 * @see https://docs.violet.io/api-reference/orders-and-checkout/orders/search-orders — Violet POST /orders/search (NOT used)
 */

import { createServerFn } from "@tanstack/react-start";
import type { OrderWithBagsAndItems } from "@ecommerce/shared";

// ─── Server Functions (TanStack Start RPC wrappers) ───────────────────────────

/**
 * Server Function — fetches authenticated user's order history in reverse
 * chronological order (FR24). Returns each order with a `bag_count` field.
 *
 * @returns {Promise<OrderWithBagCount[]>} Orders with bag counts, newest first.
 *   Empty array if the user has no orders. Each order contains monetary values
 *   in integer cents (Violet convention) and a `bag_count` derived from the
 *   Supabase aggregate `order_bags(count)`.
 * @throws {Error} "Not authenticated" — when called without a valid user session
 *   (anonymous Supabase sessions are also rejected).
 *
 * @remarks
 * No pagination is implemented — all orders are returned in a single query.
 * For users with very large order histories (100+), consider adding cursor-based
 * pagination with `.range(from, to)` on the Supabase query.
 */
export const getOrdersFn = createServerFn({ method: "GET" }).handler(async () => {
  const { ordersHandler } = await import("./orderHandlers");
  return ordersHandler();
});

/**
 * Server Function — fetches a single order with all merchant bags and items.
 * RLS (`users_read_own_orders`) ensures only the owner can access their order.
 *
 * @param data.orderId - Supabase order UUID (NOT the Violet order ID).
 *   The Violet numeric order ID is stored in the `violet_order_id` column but
 *   is never used for lookups — we always use our own UUID primary key.
 * @returns {Promise<OrderWithBagsAndItems | null>} Full order with nested bags,
 *   items, and refunds. Returns null if the order is not found or RLS blocks
 *   access (PGRST116 error). Includes `order_refunds` on each bag (empty array
 *   if no refunds exist — never null per Supabase nested select semantics).
 * @throws {Error} "Not authenticated" — when called without a valid user session.
 * @throws {Error} Supabase error message — for unexpected database errors.
 */
export const getOrderDetailFn = createServerFn({ method: "GET" })
  .inputValidator((data: { orderId: string }) => data)
  .handler(async ({ data }): Promise<OrderWithBagsAndItems | null> => {
    const { orderDetailHandler } = await import("./orderHandlers");
    return orderDetailHandler(data.orderId);
  });
