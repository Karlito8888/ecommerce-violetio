/**
 * Order Handler Logic — server-only implementation.
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
 * ## Testability
 * Tests import these handlers directly and mock getSupabaseSessionClient.
 */

import type { OrderWithBagCount, OrderWithBagsAndItems } from "@ecommerce/shared";
import { getSupabaseSessionClient } from "./supabaseServer";

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
 * ## Nested select: `order_refunds (*)`
 * The Supabase select includes `order_refunds (*)` to fetch refund details alongside
 * bag data. Refund rows are populated by the `processBagRefunded` webhook handler
 * after fetching from Violet's Refund API. If no refunds exist, `order_refunds`
 * is an empty array — never null (Supabase nested select semantics).
 *
 * ## RLS coverage
 * `order_refunds` RLS policy `users_read_own_order_refunds` allows authenticated
 * users to read refunds for their own bags (join through order_bags → orders).
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
