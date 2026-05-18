import { queryOptions, useQuery } from "@tanstack/react-query";
import { queryKeys } from "../utils/constants.js";
import type { RecentlyViewedEntry } from "../types/recentlyViewed.types.js";

// ── localStorage helpers (web only) ──────────────────────────────────

const RECENTLY_VIEWED_STORAGE_KEY = "recently-viewed";
const MAX_RECENTLY_VIEWED = 12;

/**
 * Reads recently viewed product entries from localStorage.
 * Returns empty array on SSR, parse failure, or missing key.
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
 * The authenticated path requires a `fetchUserEvents` function injected by
 * the consuming component (platform-specific). On web/mobile, this calls
 * the Convex query `api.tracking.queries.getUserEvents`. This keeps the
 * shared hook backend-agnostic (no Convex import in packages/shared).
 *
 * Anonymous users read from localStorage (no fetch needed).
 */
export interface UseRecentlyViewedOptions {
  /** Authenticated user ID. If undefined, reads from localStorage (anonymous). */
  userId?: string;
  /** Maximum number of recently viewed entries to return (default: 12). */
  limit?: number;
  /**
   * Platform-specific function to fetch user events.
   * Called for authenticated users to get product_view events.
   * Should return events with payload.product_id fields.
   *
   * @example
   * ```ts
   * // Web/Mobile consumer:
   * const events = await fetchUserEvents(userId, "product_view", limit * 2);
   * ```
   */
  fetchUserEvents?: (
    userId: string,
    eventType: string,
    limit: number,
  ) => Promise<Array<{ payload?: Record<string, unknown> }>>;
}

/**
 * Creates TanStack Query options for recently viewed product IDs.
 *
 * - Authenticated users: calls `fetchUserEvents` (injected by consumer).
 * - Anonymous users: reads from localStorage (client-only).
 *
 * Returns raw product IDs (strings), NOT enriched product data.
 * Consumers must fetch product details separately.
 */
export function recentlyViewedQueryOptions(options: UseRecentlyViewedOptions = {}) {
  const { userId, limit = MAX_RECENTLY_VIEWED, fetchUserEvents } = options;
  const isAuthenticated = !!userId;

  return queryOptions({
    queryKey: isAuthenticated
      ? queryKeys.recentlyViewed.forUser(userId!)
      : queryKeys.recentlyViewed.anonymous(),
    queryFn: async (): Promise<string[]> => {
      if (isAuthenticated && fetchUserEvents) {
        const events = await fetchUserEvents(userId!, "product_view", limit * 2);

        // Deduplicate: keep first occurrence (most recent) of each product_id
        const seen = new Set<string>();
        const ids: string[] = [];
        for (const event of events) {
          const productId = (event.payload as { product_id?: string })?.product_id;
          if (productId && !seen.has(productId)) {
            seen.add(productId);
            ids.push(productId);
            if (ids.length >= limit) break;
          }
        }
        return ids;
      }

      // Anonymous or no fetchUserEvents: read from localStorage
      const entries = getRecentlyViewedFromStorage();
      return entries.slice(0, limit).map((e) => e.productId);
    },
    staleTime: 2 * 60 * 1000,
    enabled: true,
  });
}

/**
 * React hook for recently viewed product IDs.
 *
 * Returns an array of product ID strings in reverse chronological order.
 * Anonymous users read from localStorage; authenticated users call
 * the injected `fetchUserEvents` function.
 *
 * @example
 * ```tsx
 * // Web consumer with Convex:
 * const { data: productIds } = useRecentlyViewed({
 *   userId,
 *   fetchUserEvents: async (uid, type, lim) => {
 *     // Call Convex query
 *     return await convexQuery(api.tracking.queries.getUserEvents, { userId: uid, eventType: type, limit: lim });
 *   },
 * });
 *
 * // Anonymous (no fetchUserEvents needed):
 * const { data: productIds } = useRecentlyViewed({});
 * ```
 */
export function useRecentlyViewed(options: UseRecentlyViewedOptions = {}) {
  return useQuery(recentlyViewedQueryOptions(options));
}
