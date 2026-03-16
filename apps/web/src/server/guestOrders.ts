/**
 * Guest Order Server Functions — lookup orders without authentication.
 *
 * ## Two lookup paths
 *
 * 1. **Token-based**: The guest has a plaintext lookup token from the order
 *    confirmation page. We hash it server-side (SHA-256) and query by hash.
 *    No auth session required.
 *
 * 2. **Email-based**: The guest verifies their email via Supabase OTP (magic link).
 *    After OTP verification, a temporary Supabase session exists. We confirm the
 *    session's email, then use service_role to query all orders for that email.
 *    The browser signs out after displaying results to clean up the session.
 *
 * ## Security model
 *
 * Both handlers use `getSupabaseServer()` (service role) for the orders query
 * because the `orders` table has NO anon/public SELECT RLS policy by design —
 * guest lookup goes through service_role only.
 *
 * For email-based lookup, `getSupabaseSessionClient()` is used ONLY to verify
 * the OTP session's email identity (not for the actual orders query).
 *
 * ## Testability
 * Pure handlers are exported for unit testing — tests call them directly
 * without needing TanStack Start's RPC layer.
 */

import { createServerFn } from "@tanstack/react-start";
import { hashOrderLookupToken } from "@ecommerce/shared/server/utils";
import type { OrderWithBagsAndItems } from "@ecommerce/shared";
import { getSupabaseServer, getSupabaseSessionClient } from "./supabaseServer";

// ─── Handler Logic (exported for unit testing) ────────────────────────────────

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

// ─── Server Functions (TanStack Start RPC wrappers) ───────────────────────────

/**
 * Server Function — looks up a single guest order by plaintext lookup token.
 * Hashes the token server-side before querying (SHA-256).
 */
export const lookupOrderByTokenFn = createServerFn({ method: "GET" })
  .inputValidator((data: { token: string }) => data)
  .handler(async ({ data }) => lookupOrderByTokenHandler(data.token));

/**
 * Server Function — fetches all guest orders for the OTP-verified session email.
 * Must be called immediately after Supabase OTP verification while session exists.
 */
export const lookupOrdersByEmailFn = createServerFn({ method: "GET" }).handler(() =>
  lookupOrdersByEmailHandler(),
);
