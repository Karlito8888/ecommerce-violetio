/**
 * Guest Order Handler Logic — server-only implementation.
 *
 * Pure handler functions containing the business logic for guest order lookups.
 * Separated from guestOrders.ts (the TanStack Start entry) so that node:crypto
 * does NOT appear in the client bundle.
 *
 * ## Why a separate file?
 * TanStack Start removes the `.handler(fn)` body from the client bundle, but
 * leaves top-level static imports intact. If this logic lived in guestOrders.ts
 * alongside the createServerFn exports, Rollup would include hashOrderLookupToken
 * (and transitively node:crypto) in the client build.
 *
 * guestOrders.ts loads these handlers via `await import("./guestOrderHandlers")`
 * INSIDE each .handler() closure — the dynamic import is removed with the handler
 * body, keeping node:crypto out of the client bundle.
 *
 * ## Testability
 * Tests import these handlers directly and mock their Supabase dependencies.
 */

import { hashOrderLookupToken } from "@ecommerce/shared/server/utils";
import type { OrderWithBagsAndItems } from "@ecommerce/shared";
import { getSupabaseServer, getSupabaseSessionClient } from "./supabaseServer";

/**
 * Core logic for looking up a single guest order by its plaintext lookup token.
 * The token is hashed server-side before querying (SHA-256 hex digest).
 *
 * @returns The matching order with bags and items, or null if not found/invalid.
 * @throws Error for unexpected Supabase errors (not PGRST116).
 */
export async function lookupOrderByTokenHandler(
  token: string,
): Promise<OrderWithBagsAndItems | null> {
  const tokenHash = hashOrderLookupToken(token);
  const supabase = getSupabaseServer(); // service role — bypasses RLS (no anon policy)

  const { data, error } = await supabase
    .from("orders")
    .select("*, order_bags(*, order_items(*))")
    .eq("order_lookup_token_hash", tokenHash)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null; // token not found or expired
    throw new Error(error.message);
  }

  return data as unknown as OrderWithBagsAndItems;
}

/**
 * Core logic for fetching all guest orders by the email in the verified OTP session.
 *
 * Requires: a valid Supabase OTP session must already exist in cookies before calling
 * this function (the browser-side OTP verification step creates it).
 *
 * @returns All orders for the verified email, newest first. Empty array if none.
 * @throws Error("Not authenticated") when no valid session/email is found.
 */
export async function lookupOrdersByEmailHandler(): Promise<OrderWithBagsAndItems[]> {
  // Use session client ONLY to confirm OTP-verified email identity (respects RLS)
  const sessionSupabase = getSupabaseSessionClient();
  const {
    data: { user },
  } = await sessionSupabase.auth.getUser();

  if (!user?.email) throw new Error("Not authenticated");

  // Use service_role for the actual query — no user_id-based RLS for guest orders
  const supabase = getSupabaseServer();
  const { data, error } = await supabase
    .from("orders")
    .select("*, order_bags(*, order_items(*))")
    .eq("email", user.email)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  return (data ?? []) as unknown as OrderWithBagsAndItems[];
}
