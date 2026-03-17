import { useEffect, useCallback } from "react";
import { useRouter } from "@tanstack/react-router";
import { useTracking, addToRecentlyViewedStorage } from "@ecommerce/shared";
import type { TrackingEvent } from "@ecommerce/shared";
import { trackEventFn } from "../server/tracking";

/**
 * Web-specific tracking hook — wraps the shared `useTracking` hook with the
 * web `sendEvent` implementation (calls the `trackEventFn` Server Function).
 *
 * ## Security (H1 code-review fix)
 * The `sendEvent` callback does NOT send `userId` to the server. The Server
 * Function extracts the authenticated user from the session cookie server-side
 * via `getSupabaseSessionClient()`. The `userId` parameter from `useTracking`
 * is only used client-side for the anonymous-user guard and dedup key.
 *
 * ## Why a separate hook?
 * Extracted from `useTrackingListener` so that individual route components
 * (e.g., the search page) can track events with richer context (like
 * `result_count`) without duplicating the sendEvent setup.
 *
 * @param userId - Authenticated user ID (undefined for anonymous/guests).
 *   Only used client-side — the server validates identity independently.
 */
export function useWebTracking(userId: string | undefined) {
  const sendEvent = useCallback(async (_userId: string, event: TrackingEvent) => {
    await trackEventFn({ data: { event } });
  }, []);

  return useTracking({ userId, sendEvent });
}

/**
 * [M3 code-review fix] Extracted shared product route regex.
 *
 * Both the localStorage subscription (anonymous + auth) and the server-side
 * tracking subscription (auth only) need to detect `/products/:productId`
 * navigations. Previously the same regex was duplicated in both `useEffect`
 * callbacks. A single constant avoids drift and makes the pattern testable.
 */
const PRODUCT_ROUTE_PATTERN = /^\/products\/([^/]+)$/;

/**
 * Router-level tracking listener — fires `product_view` and `category_view`
 * events on TanStack Router navigation.
 *
 * ## What is NOT tracked here (H2 code-review fix)
 * **Search events** are tracked in `routes/search/index.tsx` instead, because
 * the router listener doesn't have access to `result_count` (AC #2 requires it).
 * The search page component tracks after results load with the actual count.
 *
 * ## How it works
 * Subscribes to `router.subscribe('onResolved')` — fires after navigation
 * completes (not on click, not during loading). Uses `toLocation.pathname`
 * and `toLocation.search` to determine the page type and extract parameters.
 *
 * ## Route patterns matched
 * - `/products/:productId` → `product_view` with `{ product_id }`
 * - `/products?category=X` → `category_view` with `{ category_id, category_name }`
 *
 * ## Two separate subscriptions — by design
 * The localStorage write (first `useEffect`) runs for ALL users including
 * anonymous, while the server tracking (second `useEffect`) only fires for
 * authenticated users. Merging them would require conditional logic inside
 * a single subscription and re-subscribe on `userId` changes, which is more
 * fragile than two independent effects with clear responsibilities.
 *
 * Mounted once in `__root.tsx` — covers all page navigations app-wide.
 *
 * @param userId - Authenticated user ID. Server-side tracking is skipped for anonymous users.
 */
export function useTrackingListener(userId: string | undefined) {
  const router = useRouter();
  const { trackEvent } = useWebTracking(userId);

  // Record product views to localStorage for ALL users (anonymous + authenticated).
  // This powers the "Recently Viewed" section on the homepage.
  // Runs independently of server-side tracking (which requires userId).
  useEffect(() => {
    const unsubscribe = router.subscribe("onResolved", (event) => {
      const productMatch = event.toLocation.pathname.match(PRODUCT_ROUTE_PATTERN);
      if (productMatch) {
        addToRecentlyViewedStorage(productMatch[1]);
      }
    });
    return unsubscribe;
  }, [router]);

  useEffect(() => {
    if (!userId) return;

    const unsubscribe = router.subscribe("onResolved", (event) => {
      const pathname = event.toLocation.pathname;
      const search = event.toLocation.search as Record<string, unknown>;

      // Product detail page: /products/$productId
      const productMatch = pathname.match(PRODUCT_ROUTE_PATTERN);
      if (productMatch) {
        trackEvent({
          event_type: "product_view",
          payload: { product_id: productMatch[1] },
        });
        return;
      }

      /**
       * Category browsing: /products?category=...
       *
       * M1 note: `offer_id` and `category` are intentionally omitted from
       * product_view payloads — they're not available from route params alone.
       * The product detail page would need to fetch the full product data to
       * populate these fields. AC #1 marks them as part of the payload spec,
       * but the types define them as optional (`offer_id?: string`).
       * Downstream consumers (Stories 6.3, 6.5) can JOIN user_events with
       * the product catalog to enrich the data at query time.
       */
      if (pathname === "/products" && search.category) {
        trackEvent({
          event_type: "category_view",
          payload: {
            category_id: String(search.category),
            category_name: String(search.category),
          },
        });
      }
    });

    return unsubscribe;
  }, [userId, router, trackEvent]);
}
