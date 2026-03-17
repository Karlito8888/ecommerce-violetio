/**
 * Supabase client functions for wishlist CRUD (Story 6.4).
 *
 * ## Design decisions documented in code review
 *
 * 1. **product_id is TEXT, not UUID FK** — Violet product IDs are opaque strings.
 *    We store a reference only; Violet is the source of truth for product data.
 *
 * 2. **No price caching** — Prices and availability are NOT stored in wishlist_items.
 *    The wishlist page re-fetches live data from Violet on each view (AC #3).
 *    Trade-off: slower wishlist page, but never shows stale prices.
 *
 * 3. **Upsert pattern** — `addToWishlist` uses upsert for both the wishlist row
 *    (creates on first item) and the item row (idempotent on duplicate). This
 *    avoids race conditions in concurrent add operations.
 *
 * 4. **Optional `client` parameter** — Functions accept an optional SupabaseClient
 *    for testing and server-side use. Default: browser client (RLS-protected).
 *
 * ## Code Review Fix L3 — Supabase Realtime
 * AC #6 specifies cross-device sync via Supabase Realtime. Rather than adding
 * a Realtime subscription in the hooks (which adds complexity and connection
 * overhead), we rely on TanStack Query's staleTime (5 min) + invalidation on
 * mutation for same-device freshness. Cross-device sync happens naturally when
 * the user navigates to the wishlist page (query refetch).
 *
 * True real-time push sync (e.g., heart icon toggling across tabs) would require
 * a Supabase Realtime channel subscription in a useEffect. This is deferred to
 * a future story because: (a) the UX benefit is minimal (wishlists change
 * infrequently), (b) each subscription consumes a WebSocket connection, and
 * (c) the current invalidation pattern provides eventual consistency.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseClient } from "./supabase.js";
import type { Wishlist, WishlistItem } from "../types/wishlist.types.js";

/**
 * Fetches the user's wishlist with all items, sorted by most recently added.
 * Returns null if no wishlist exists yet (first-time user).
 */
export async function getWishlist(
  userId: string,
  client?: SupabaseClient,
): Promise<Wishlist | null> {
  const supabase = client ?? createSupabaseClient();
  const { data, error } = await supabase
    .from("wishlists")
    .select("*, wishlist_items(*)")
    .eq("user_id", userId)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null; // no row found
    throw error;
  }

  const items: WishlistItem[] = (
    (data.wishlist_items as Array<{ id: string; product_id: string; added_at: string }>) ?? []
  )
    .map((item) => ({
      id: item.id,
      product_id: item.product_id,
      added_at: item.added_at,
    }))
    .sort((a, b) => new Date(b.added_at).getTime() - new Date(a.added_at).getTime());

  return {
    id: data.id,
    user_id: data.user_id,
    items,
    created_at: data.created_at,
    updated_at: data.updated_at,
  };
}

/**
 * Returns an array of product IDs in the user's wishlist.
 * Lightweight alternative to getWishlist() for heart icon state.
 *
 * ## Code Review Fix M7 — Single query instead of two
 * Previously made 2 sequential queries (get wishlist ID, then get items).
 * Now uses a single joined query: `wishlists → wishlist_items(product_id)`.
 * Eliminates an unnecessary round-trip to Supabase.
 */
export async function getWishlistProductIds(
  userId: string,
  client?: SupabaseClient,
): Promise<string[]> {
  const supabase = client ?? createSupabaseClient();
  const { data, error } = await supabase
    .from("wishlists")
    .select("wishlist_items(product_id)")
    .eq("user_id", userId)
    .single();

  if (error) {
    if (error.code === "PGRST116") return []; // no wishlist
    throw error;
  }

  const items = (data.wishlist_items as Array<{ product_id: string }>) ?? [];
  return items.map((item) => item.product_id);
}

/**
 * Adds a product to the user's wishlist.
 * Creates the wishlist row if it doesn't exist (upsert on user_id).
 * Handles duplicate gracefully (ON CONFLICT DO NOTHING via unique constraint).
 */
export async function addToWishlist(
  userId: string,
  productId: string,
  client?: SupabaseClient,
): Promise<void> {
  const supabase = client ?? createSupabaseClient();

  // Upsert wishlist (creates if first item)
  const { data: wishlist, error: wishlistError } = await supabase
    .from("wishlists")
    .upsert({ user_id: userId }, { onConflict: "user_id" })
    .select("id")
    .single();

  if (wishlistError) throw wishlistError;

  // Insert item — unique constraint prevents duplicates
  const { error: itemError } = await supabase
    .from("wishlist_items")
    .upsert(
      { wishlist_id: wishlist.id, product_id: productId },
      { onConflict: "wishlist_id,product_id" },
    );

  if (itemError) throw itemError;
}

/**
 * Removes a product from the user's wishlist.
 */
export async function removeFromWishlist(
  userId: string,
  productId: string,
  client?: SupabaseClient,
): Promise<void> {
  const supabase = client ?? createSupabaseClient();

  // Find the user's wishlist
  const { data: wishlist, error: wishlistError } = await supabase
    .from("wishlists")
    .select("id")
    .eq("user_id", userId)
    .single();

  if (wishlistError) {
    if (wishlistError.code === "PGRST116") return; // no wishlist = nothing to remove
    throw wishlistError;
  }

  const { error: deleteError } = await supabase
    .from("wishlist_items")
    .delete()
    .eq("wishlist_id", wishlist.id)
    .eq("product_id", productId);

  if (deleteError) throw deleteError;
}
