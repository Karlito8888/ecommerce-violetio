/**
 * Order Handler Logic — server-only implementation.
 *
 * @module server/orderHandlers
 *
 * Pure handler functions for fetching authenticated user orders from Supabase.
 * Separated from orders.ts (the TanStack Start entry) so that the import of
 * getSupabaseSessionClient (which imports @tanstack/react-start/server via
 * supabaseServer.ts) does NOT appear in the client bundle.
 *
 * ## Why a separate file?
 * TanStack Start's import-protection-plugin blocks @tanstack/react-start/server
 * imports that reach the client bundle via non-createServerFn helper files.
 * orders.ts loads these handlers via dynamic import inside each .handler() closure —
 * that import is removed with the handler body in the client bundle.
 *
 * ## Data flow
 * ```
 * Client → orders.ts (RPC wrapper)
 *            ↓ dynamic import("./orderHandlers")
 *          orderHandlers.ts
 *            ↓ getSupabaseSessionClient() — anon key + user JWT from cookies
 *          Supabase (RLS: users_read_own_orders policy)
 *            ↓ SELECT from orders/order_bags/order_items/order_refunds
 *          Response → Client
 * ```
 *
 * ## Authentication model
 * All handlers require a fully authenticated (non-anonymous) Supabase session.
 * The session JWT is extracted from HTTP-only cookies by `getSupabaseSessionClient()`.
 * RLS policies provide an additional layer of data isolation beyond the `user_id`
 * filter in queries.
 *
 * ## Testability
 * Tests import these handlers directly and mock getSupabaseSessionClient.
 *
 * @see https://docs.violet.io/prism/checkout-guides/carts-and-bags/carts/lifecycle-of-a-cart — Order status lifecycle
 * @see https://docs.violet.io/prism/checkout-guides/guides/order-and-bag-states — Bag status states
 */

import type { OrderWithBagCount, OrderWithBagsAndItems } from "@ecommerce/shared";
import { getSupabaseSessionClient } from "./supabaseServer";

/**
 * Core logic for fetching the authenticated user's order history.
 * Exported for unit testing — call this directly in tests instead of `getOrdersFn`.
 *
 * ## Supabase query strategy
 * Uses `order_bags(count)` aggregate to get bag count without fetching full bag data.
 * Results are ordered by `created_at DESC` for reverse-chronological display (FR24).
 * The `.eq("user_id", user.id)` filter is technically redundant given RLS, but serves
 * as defense-in-depth and makes the query's intent explicit.
 *
 * ## Missing pagination
 * Currently returns ALL orders without pagination. This is acceptable for the MVP
 * (most users will have <50 orders), but should be addressed before scaling.
 * Recommendation: add `.range(offset, offset + limit)` with cursor-based pagination.
 *
 * @returns All orders for the authenticated user, newest first, with bag counts.
 * @throws {Error} "Not authenticated" when no valid user session exists
 *   or when the session belongs to an anonymous user.
 */
export async function ordersHandler(): Promise<OrderWithBagCount[]> {
  const supabase = getSupabaseSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.is_anonymous) {
    throw new Error("Not authenticated");
  }

  const { data, error } = await supabase
    .from("orders")
    .select("*, order_bags(count)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  // Transform Supabase aggregate result: { order_bags: [{ count: N }] } → { bag_count: N }
  return (data ?? []).map((row) => {
    const { order_bags, ...orderRow } = row as typeof row & {
      order_bags: { count: number }[];
    };
    return {
      ...orderRow,
      bag_count: order_bags?.[0]?.count ?? 0,
    } as OrderWithBagCount;
  });
}

/**
 * Core logic for fetching a single order with bags and items.
 * Exported for unit testing — call this directly in tests instead of `getOrderDetailFn`.
 *
 * ## Nested select strategy
 * ```sql
 * SELECT *, order_bags(*, order_items(*), order_refunds(*))
 * FROM orders WHERE id = :orderId AND user_id = :userId
 * ```
 * This performs a single query with PostgREST nested resource embedding,
 * avoiding N+1 queries. The `.single()` call asserts exactly one result.
 *
 * ## Nested select: `order_refunds (*)`
 * The Supabase select includes `order_refunds (*)` to fetch refund details alongside
 * bag data. Refund rows are populated by the `processBagRefunded` webhook handler
 * after fetching from Violet's Refund API (`GET /v1/orders/{id}/bags/{id}/refunds`).
 * If no refunds exist, `order_refunds` is an empty array — never null (Supabase
 * nested select semantics).
 *
 * ## RLS coverage
 * - `orders`: `users_read_own_orders` policy (user_id = auth.uid())
 * - `order_bags`: inherited via FK join to orders
 * - `order_items`: inherited via FK join to order_bags
 * - `order_refunds`: `users_read_own_order_refunds` policy (join through order_bags -> orders)
 *
 * ## Error handling
 * - PGRST116 (no rows) → returns null (order not found OR RLS blocked access)
 * - Other errors → throws with the Supabase error message
 * Note: PGRST116 is ambiguous — it could mean the order doesn't exist OR the user
 * doesn't own it. This is intentional to prevent order ID enumeration.
 *
 * @param orderId - Supabase order UUID (NOT the Violet numeric order ID)
 * @returns The order with nested bags, items, and refunds, or null if not found.
 * @throws {Error} "Not authenticated" when no valid user session exists
 * @throws {Error} Supabase error message for unexpected database errors
 *
 * @see https://docs.violet.io/api-reference/orders-and-checkout/order-refunds/refund-bag — Violet Refund API
 * @see https://docs.violet.io/prism/checkout-guides/guides/order-and-bag-states — Order/Bag status states
 */
export async function orderDetailHandler(orderId: string): Promise<OrderWithBagsAndItems | null> {
  const supabase = getSupabaseSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.is_anonymous) {
    throw new Error("Not authenticated");
  }

  const { data: order, error } = await supabase
    .from("orders")
    .select(
      `
      *,
      order_bags (
        *,
        order_items (*),
        order_refunds (*)
      )
    `,
    )
    .eq("id", orderId)
    .eq("user_id", user.id)
    .single();

  if (error) {
    // PGRST116 = no rows found (RLS blocked access or order doesn't exist)
    if (error.code === "PGRST116") return null;
    throw new Error(error.message);
  }

  return order as unknown as OrderWithBagsAndItems;
}
