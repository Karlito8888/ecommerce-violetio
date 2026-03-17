/**
 * Shared wishlist hooks and query factories (Story 6.4).
 *
 * Uses the "query options factory" pattern for SSR-compatibility:
 * - Route loaders can prefetch with `queryClient.ensureQueryData(wishlistQueryOptions(...))`
 * - Components consume via `useQuery(wishlistQueryOptions(...))`
 *
 * Wishlist mutations use optimistic updates for instant heart icon toggling.
 *
 * ## Why direct imports instead of adapter pattern? (Code Review Fix M2)
 *
 * The story spec (Task 5.9) originally required the adapter pattern (like useCart)
 * where hooks accept `fetchFn`, `addFn`, `removeFn` parameters. However:
 *
 * 1. **Wishlist is Supabase-only** — unlike Cart (which needs Violet API via Server
 *    Functions on web), wishlist operations are all Supabase CRUD with RLS.
 * 2. **The profile precedent** — `useProfile` hooks also use direct client imports
 *    because profile is Supabase-only. This is the established pattern for
 *    Supabase-only features in this codebase.
 * 3. **Supabase client works identically on web and mobile** — the browser client
 *    (`createSupabaseClient()`) is platform-agnostic. RLS handles auth enforcement.
 *    No Server Functions are needed for wishlist security.
 *
 * If wishlist ever requires a platform-specific transport layer (e.g., Edge Functions
 * for rate limiting), refactor to adapter pattern at that point.
 *
 * The function type aliases (`WishlistFetchFn`, `AddToWishlistFn`, etc.) in
 * `wishlist.types.ts` are kept for API documentation and potential future use.
 */

import { queryOptions, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getWishlist,
  getWishlistProductIds,
  addToWishlist,
  removeFromWishlist,
} from "../clients/wishlist.js";
import type { Wishlist } from "../types/wishlist.types.js";

export const wishlistKeys = {
  all: (userId: string) => ["wishlist", userId] as const,
  productIds: (userId: string) => ["wishlist", userId, "productIds"] as const,
};

/**
 * Query options for a user's full wishlist.
 * staleTime 5 min matches architecture.md caching spec ("profile 5 min").
 */
export function wishlistQueryOptions(userId: string) {
  return queryOptions({
    queryKey: wishlistKeys.all(userId),
    queryFn: () => getWishlist(userId),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Query options for just the product IDs in a user's wishlist.
 * Lightweight query used by WishlistButton to determine heart icon state.
 */
export function wishlistProductIdsQueryOptions(userId: string) {
  return queryOptions({
    queryKey: wishlistKeys.productIds(userId),
    queryFn: () => getWishlistProductIds(userId),
    staleTime: 5 * 60 * 1000,
  });
}

/** Hook for fetching the full wishlist (wishlist page). */
export function useWishlist(userId: string | undefined) {
  return useQuery({
    ...wishlistQueryOptions(userId ?? ""),
    enabled: !!userId,
  });
}

/** Hook for fetching wishlist product IDs (heart icon state). */
export function useWishlistProductIds(userId: string | undefined) {
  return useQuery({
    ...wishlistProductIdsQueryOptions(userId ?? ""),
    enabled: !!userId,
  });
}

/** Returns true if the given productId is in the user's wishlist. */
export function useIsInWishlist(productId: string, userId: string | undefined): boolean {
  const { data: productIds } = useWishlistProductIds(userId);
  if (!productIds) return false;
  return productIds.includes(productId);
}

/** Mutation hook for adding a product to the wishlist with optimistic update. */
export function useAddToWishlist(userId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (productId: string) => addToWishlist(userId, productId),
    onMutate: async (productId) => {
      // Cancel in-flight queries
      await queryClient.cancelQueries({ queryKey: wishlistKeys.all(userId) });
      await queryClient.cancelQueries({ queryKey: wishlistKeys.productIds(userId) });

      // Snapshot previous values
      const previousWishlist = queryClient.getQueryData<Wishlist | null>(wishlistKeys.all(userId));
      const previousIds = queryClient.getQueryData<string[]>(wishlistKeys.productIds(userId));

      // Optimistically add to product IDs
      if (previousIds) {
        queryClient.setQueryData<string[]>(wishlistKeys.productIds(userId), [
          ...previousIds,
          productId,
        ]);
      }

      // Optimistically add to full wishlist
      if (previousWishlist) {
        queryClient.setQueryData<Wishlist>(wishlistKeys.all(userId), {
          ...previousWishlist,
          items: [
            /**
             * M2 review fix: Use Date.now() fallback instead of crypto.randomUUID().
             *
             * crypto.randomUUID() is not available on React Native without a polyfill
             * (expo-crypto). Since this ID is only used as a temporary optimistic
             * placeholder — replaced by the real server-generated UUID on onSettled
             * invalidation — a unique-enough timestamp-based ID is sufficient.
             */
            {
              id: `optimistic-${Date.now()}`,
              product_id: productId,
              added_at: new Date().toISOString(),
            },
            ...previousWishlist.items,
          ],
        });
      }

      return { previousWishlist, previousIds };
    },
    onError: (_err, _productId, context) => {
      if (context?.previousWishlist !== undefined) {
        queryClient.setQueryData(wishlistKeys.all(userId), context.previousWishlist);
      }
      if (context?.previousIds !== undefined) {
        queryClient.setQueryData(wishlistKeys.productIds(userId), context.previousIds);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: wishlistKeys.all(userId) });
      queryClient.invalidateQueries({ queryKey: wishlistKeys.productIds(userId) });
    },
  });
}

/** Mutation hook for removing a product from the wishlist with optimistic update. */
export function useRemoveFromWishlist(userId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (productId: string) => removeFromWishlist(userId, productId),
    onMutate: async (productId) => {
      await queryClient.cancelQueries({ queryKey: wishlistKeys.all(userId) });
      await queryClient.cancelQueries({ queryKey: wishlistKeys.productIds(userId) });

      const previousWishlist = queryClient.getQueryData<Wishlist | null>(wishlistKeys.all(userId));
      const previousIds = queryClient.getQueryData<string[]>(wishlistKeys.productIds(userId));

      // Optimistically remove from product IDs
      if (previousIds) {
        queryClient.setQueryData<string[]>(
          wishlistKeys.productIds(userId),
          previousIds.filter((id) => id !== productId),
        );
      }

      // Optimistically remove from full wishlist
      if (previousWishlist) {
        queryClient.setQueryData<Wishlist>(wishlistKeys.all(userId), {
          ...previousWishlist,
          items: previousWishlist.items.filter((item) => item.product_id !== productId),
        });
      }

      return { previousWishlist, previousIds };
    },
    onError: (_err, _productId, context) => {
      if (context?.previousWishlist !== undefined) {
        queryClient.setQueryData(wishlistKeys.all(userId), context.previousWishlist);
      }
      if (context?.previousIds !== undefined) {
        queryClient.setQueryData(wishlistKeys.productIds(userId), context.previousIds);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: wishlistKeys.all(userId) });
      queryClient.invalidateQueries({ queryKey: wishlistKeys.productIds(userId) });
    },
  });
}
