// packages/shared/src/hooks/convex/useWishlist.ts
//
// Convex-based wishlist hooks.
// Replaces the Supabase-based useWishlist.ts during migration.
//
// Uses Convex hooks directly (reactive by default, no TanStack Query bridge needed).
// These hooks work inside ConvexAuthProvider (câblé dans router.tsx web + _layout.tsx mobile).
//
// Migration note: Consumers should switch from useWishlist → useWishlistConvex.
// The old hooks will be removed in Phase 11 (cleanup).

import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";

/** Reactive wishlist with items, sorted by most recently added. */
export function useWishlistConvex(userId: string | undefined) {
  return useQuery(api.wishlists.queries.getWishlist, userId ? { userId } : "skip");
}

/** Reactive array of product IDs in the wishlist (lightweight, for heart icons). */
export function useWishlistProductIdsConvex(userId: string | undefined) {
  return useQuery(api.wishlists.queries.getWishlistProductIds, userId ? { userId } : "skip");
}

/** Returns true if the given productId is in the user's wishlist. */
export function useIsInWishlistConvex(productId: string, userId: string | undefined): boolean {
  const productIds = useWishlistProductIdsConvex(userId);
  if (!productIds) return false;
  return productIds.includes(productId);
}

/** Mutation: add a product to the wishlist. */
export function useAddToWishlistConvex() {
  return useMutation(api.wishlists.mutations.addToWishlist);
}

/** Mutation: remove a product from the wishlist. */
export function useRemoveFromWishlistConvex() {
  return useMutation(api.wishlists.mutations.removeFromWishlist);
}
