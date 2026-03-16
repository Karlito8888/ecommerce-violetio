/**
 * Guest Order Handler Logic — server-only implementation.
 *
 * @module server/guestOrderHandlers
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
 * ## Service role usage
 * Both handlers use `getSupabaseServer()` (service_role) for the actual data query.
 * This is necessary because guest orders have no `user_id` and thus no RLS policy
 * can scope access. Security is enforced by:
 * - **Token path**: The 256-bit token entropy makes guessing infeasible.
 * - **Email path**: The OTP verification step confirms the caller owns the email.
 *
 * ## Testability
 * Tests import these handlers directly and mock their Supabase dependencies.
 *
 * @see {@link hashOrderLookupToken} — SHA-256 hashing utility from shared/server/utils
 * @see {@link getSupabaseServer} — service_role client (bypasses RLS)
 * @see {@link getSupabaseSessionClient} — session client (respects RLS, used only for email identity)
 */

import { hashOrderLookupToken } from "@ecommerce/shared/server/utils";
import type { OrderWithBagsAndItems } from "@ecommerce/shared";
import { getSupabaseServer, getSupabaseSessionClient } from "./supabaseServer";

/**
 * Core logic for looking up a single guest order by its plaintext lookup token.
 * The token is hashed server-side before querying (SHA-256 hex digest).
 *
 * ## Query strategy
 * ```sql
 * SELECT *, order_bags(*, order_items(*), order_refunds(*))
 * FROM orders WHERE order_lookup_token_hash = :hash
 * ```
 * Uses `.single()` because each token hash is unique (one-to-one with orders).
 *
 * ## Nested select: `order_refunds (*)`
 * Includes refund data from the `order_refunds` table (populated by the
 * BAG_REFUNDED webhook handler via Violet's Refund API). Guest lookups use
 * service_role which bypasses RLS — the `service_role_all_order_refunds` policy
 * grants full access.
 *
 * ## Security note
 * The token is never logged or stored in plaintext. Only the SHA-256 hash is used
 * for the database query. The PGRST116 (not found) case returns null without
 * revealing whether the order exists — preventing enumeration attacks.
 *
 * @param token - Plaintext base64url token (32 bytes / 43 chars) from the
 *   confirmation page. Will be hashed to SHA-256 hex (64 chars) before querying.
 * @returns The matching order with bags and items, or null if not found/invalid.
 * @throws {Error} For unexpected Supabase errors (not PGRST116).
 *
 * @see https://docs.violet.io/api-reference/orders-and-checkout/order-refunds/refund-bag — Violet Refund API
 */
export async function lookupOrderByTokenHandler(
  token: string,
): Promise<OrderWithBagsAndItems | null> {
  const tokenHash = hashOrderLookupToken(token);
  const supabase = getSupabaseServer(); // service role — bypasses RLS (no anon policy)

  const { data, error } = await supabase
    .from("orders")
    .select("*, order_bags(*, order_items(*), order_refunds(*))")
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
 * ## Two-client strategy
 * 1. `getSupabaseSessionClient()` — used ONLY to extract the verified email from the
 *    OTP session. This respects RLS and confirms the caller's identity.
 * 2. `getSupabaseServer()` (service_role) — used for the actual order query because
 *    guest orders have `user_id = null` and no anon RLS policy covers them.
 *
 * ## Query strategy
 * Queries by `email` column (not `user_id`) since guest orders have no associated user.
 * This means a single email can match orders from multiple guest checkout sessions.
 * Results are ordered newest-first for display consistency.
 *
 * ## Security consideration
 * The email identity is verified by Supabase OTP — the caller cannot spoof it.
 * However, note that `shouldCreateUser: true` in the OTP flow (set in lookup.tsx)
 * means a Supabase user record is created for any email. This is cleaned up by
 * the immediate `signOut()` call on the client after fetching results.
 *
 * @returns All orders for the verified email, newest first. Empty array if none.
 * @throws {Error} "Not authenticated" when no valid session or email is found.
 * @throws {Error} Supabase error message for unexpected database errors.
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
    .select("*, order_bags(*, order_items(*), order_refunds(*))")
    .eq("email", user.email)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  return (data ?? []) as unknown as OrderWithBagsAndItems[];
}
