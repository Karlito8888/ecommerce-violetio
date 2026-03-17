import { queryOptions, useQuery } from "@tanstack/react-query";
/** M6 review fix: Added .js extension for ESM consistency. */
import { getUserEvents } from "../clients/tracking.js";
import { queryKeys } from "../utils/constants.js";
import type { RecentlyViewedEntry } from "../types/recentlyViewed.types.js";

// ── localStorage helpers (web only) ──────────────────────────────────

const RECENTLY_VIEWED_STORAGE_KEY = "recently-viewed";
const MAX_RECENTLY_VIEWED = 12;

/**
 * Reads recently viewed product entries from localStorage.
 * Returns empty array on SSR, parse failure, or missing key.
 */
/**
 * M3 review fix: Added `typeof localStorage !== "undefined"` guard.
 *
 * The original `typeof window === "undefined"` guard is insufficient for
 * React Native, where `window` IS defined but `localStorage` is NOT.
 * Without this fix, calling this function on mobile (anonymous path)
 * would throw `ReferenceError: localStorage is not defined`.
 *
 * The double guard covers both SSR (no window) and React Native (no localStorage).
 */
export function getRecentlyViewedFromStorage(): RecentlyViewedEntry[] {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return [];
  try {
    const stored = localStorage.getItem(RECENTLY_VIEWED_STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

/**
 * Adds a product to the recently viewed localStorage list.
 * Deduplicates (moves re-viewed to front), trims to MAX_RECENTLY_VIEWED.
 * No-op on SSR or localStorage failure (private browsing, quota).
 */
export function addToRecentlyViewedStorage(productId: string): void {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return;
  try {
    const entries = getRecentlyViewedFromStorage();
    const filtered = entries.filter((e) => e.productId !== productId);
    filtered.unshift({ productId, viewedAt: new Date().toISOString() });
    localStorage.setItem(
      RECENTLY_VIEWED_STORAGE_KEY,
      JSON.stringify(filtered.slice(0, MAX_RECENTLY_VIEWED)),
    );
  } catch {
    // Silent fail — localStorage quota or private browsing
  }
}

// ── Query options & hook ─────────────────────────────────────────────

/**
 * Options for the `useRecentlyViewed` hook and `recentlyViewedQueryOptions`.
 *
 * ### [H3 code-review fix] Options object instead of positional params
 * AC #7 specifies `useRecentlyViewed(options: { userId?, supabaseClient?, limit? })`.
 * The original implementation used positional params `(userId, limit)`.
 * Refactored to an options object for:
 *   1. Spec compliance with AC #7
 *   2. Forward-compatibility (easy to add `supabaseClient` later)
 *   3. Consistency with `useBrowsingHistory` and other shared hooks
 *
 * ### Why no `supabaseClient` parameter?
 * The authenticated path calls `getUserEvents()` which uses the global
 * Supabase client created in `clients/supabase.ts`. Passing a client
 * instance would require threading it through `queryFn`, which adds
 * complexity with no current benefit. If multi-client support is needed
 * (e.g., admin impersonation), add `supabaseClient` to this interface.
 */
export interface UseRecentlyViewedOptions {
  /** Authenticated user ID. If undefined, reads from localStorage (anonymous). */
  userId?: string;
  /** Maximum number of recently viewed entries to return (default: 12). */
  limit?: number;
}

/**
 * Creates TanStack Query options for recently viewed product IDs.
 *
 * - Authenticated users: reads from `user_events` table (cross-device).
 * - Anonymous users: reads from localStorage (client-only).
 *
 * Returns raw product IDs (strings), NOT enriched product data.
 * Consumers must fetch product details separately (e.g., via `useQueries`
 * with `productDetailQueryOptions` — same pattern as the wishlist page).
 *
 * @param options - See {@link UseRecentlyViewedOptions}
 */
export function recentlyViewedQueryOptions(options: UseRecentlyViewedOptions = {}) {
  const { userId, limit = MAX_RECENTLY_VIEWED } = options;
  const isAuthenticated = !!userId;

  return queryOptions({
    queryKey: isAuthenticated
      ? queryKeys.recentlyViewed.forUser(userId)
      : queryKeys.recentlyViewed.anonymous(),
    queryFn: async (): Promise<string[]> => {
      if (isAuthenticated) {
        // Authenticated: fetch from user_events table (RLS-protected)
        const events = await getUserEvents(userId, {
          eventType: "product_view",
          limit: limit * 2, // over-fetch to account for duplicate product_ids
        });

        // Deduplicate: keep first occurrence (most recent) of each product_id
        const seen = new Set<string>();
        const ids: string[] = [];
        for (const event of events) {
          const productId = (event.payload as { product_id?: string }).product_id;
          if (productId && !seen.has(productId)) {
            seen.add(productId);
            ids.push(productId);
            if (ids.length >= limit) break;
          }
        }
        return ids;
      }

      // Anonymous: read from localStorage
      const entries = getRecentlyViewedFromStorage();
      return entries.slice(0, limit).map((e) => e.productId);
    },
    staleTime: 2 * 60 * 1000, // 2 min — matches browsing history staleTime
    /**
     * [L2 code-review fix] Explicit `enabled: true`.
     * AC #7 states "enabled: true always (anonymous path doesn't need auth)".
     * TanStack Query defaults to true, but being explicit here documents the
     * intentional design decision: this query runs for ALL users, including
     * anonymous ones (unlike most auth-gated queries in the codebase).
     */
    enabled: true,
  });
}

/**
 * React hook for recently viewed product IDs.
 *
 * Returns an array of product ID strings in reverse chronological order.
 * Abstracts the storage layer: localStorage for anonymous, user_events for authenticated.
 *
 * The consuming component is responsible for enriching IDs into full product data
 * (use `useQueries` with `productDetailQueryOptions` — see wishlist page pattern).
 *
 * @example
 * ```tsx
 * const { data: productIds, isLoading } = useRecentlyViewed({ userId });
 * const { data: productIds } = useRecentlyViewed({ userId, limit: 6 });
 * const { data: productIds } = useRecentlyViewed({}); // anonymous
 * ```
 */
export function useRecentlyViewed(options: UseRecentlyViewedOptions = {}) {
  return useQuery(recentlyViewedQueryOptions(options));
}
