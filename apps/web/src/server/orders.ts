/**
 * Order Server Functions — fetch order history and detail from Supabase.
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
 * ## Testability
 * Handler logic is extracted as named exports (`ordersHandler`, `orderDetailHandler`)
 * so unit tests can call them directly without needing TanStack Start's RPC layer.
 * The server functions (`getOrdersFn`, `getOrderDetailFn`) simply wrap the handlers.
 */

import { createServerFn } from "@tanstack/react-start";
import type { OrderWithBagCount, OrderWithBagsAndItems } from "@ecommerce/shared";
import { getSupabaseSessionClient } from "./supabaseServer";

// ─── Handler Logic (exported for unit testing) ────────────────────────────────

/**
 * Core logic for fetching the authenticated user's order history.
 * Exported for unit testing — call this directly in tests instead of `getOrdersFn`.
 *
 * @throws Error("Not authenticated") when no valid user session exists
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
 * @param orderId - Supabase order UUID (NOT the Violet order ID)
 * @throws Error("Not authenticated") when no valid user session exists
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
        order_items (*)
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

// ─── Server Functions (TanStack Start RPC wrappers) ───────────────────────────

/**
 * Server Function — fetches authenticated user's order history in reverse
 * chronological order (FR24). Returns each order with a `bag_count` field.
 */
export const getOrdersFn = createServerFn({ method: "GET" }).handler(() => ordersHandler());

/**
 * Server Function — fetches a single order with all merchant bags and items.
 * RLS (`users_read_own_orders`) ensures only the owner can access their order.
 *
 * @param orderId - Supabase order UUID (NOT the Violet order ID)
 */
export const getOrderDetailFn = createServerFn({ method: "GET" })
  .inputValidator((data: { orderId: string }) => data)
  .handler(async ({ data }) => orderDetailHandler(data.orderId));
