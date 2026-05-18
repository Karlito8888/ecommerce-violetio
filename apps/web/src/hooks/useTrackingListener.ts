// apps/web/src/hooks/useTrackingListener.ts
//
// Router-level tracking listener.
//
// Migrated from Supabase Server Function to Convex mutation (Phase 5 fix M3).
// The `trackEventFn` Server Function was routing through Supabase; now we call
// the Convex `tracking.mutations.recordEvent` mutation directly.
//
// The Convex mutation accepts both Convex userId and localId as `userId`,
// so we pass the appropriate identifier for both authenticated and anonymous users.

import { useEffect, useCallback } from "react";
import { useRouter } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useTracking, addToRecentlyViewedStorage, getOrCreateLocalId } from "@ecommerce/shared";
import type { TrackingEvent } from "@ecommerce/shared";
import { api } from "#convex/_generated/api";

/**
 * Web-specific tracking hook — wraps the shared `useTracking` hook with the
 * Convex `recordEvent` mutation as the sendEvent implementation.
 *
 * For authenticated users, uses their Convex userId.
 * For anonymous visitors, uses the localId (crypto.randomUUID in localStorage).
 * The Convex mutation accepts either identifier.
 */
export function useWebTracking(userId: string | undefined) {
  const recordEvent = useMutation(api.tracking.mutations.recordEvent);

  const sendEvent = useCallback(
    async (ownerId: string, event: TrackingEvent) => {
      await recordEvent({
        userId: ownerId,
        eventType: event.event_type,
        payload: event.payload,
      });
    },
    [recordEvent],
  );

  // Determine the ownerId: Convex userId (auth) or localId (anonymous)
  const ownerId = userId ?? getOrCreateLocalId();

  return useTracking({ userId: ownerId, sendEvent });
}

/**
 * [M3 code-review fix] Extracted shared product route regex.
 */
const PRODUCT_ROUTE_PATTERN = /^\/products\/([^/]+)$/;

/**
 * Router-level tracking listener — fires `product_view` and `category_view`
 * events on TanStack Router navigation.
 *
 * ## How it works
 * Subscribes to `router.subscribe('onResolved')` — fires after navigation
 * completes. Uses `toLocation.pathname` and `toLocation.search` to determine
 * the page type and extract parameters.
 *
 * ## Two separate subscriptions — by design
 * The localStorage write (first `useEffect`) runs for ALL users including
 * anonymous, while the Convex tracking (second `useEffect`) fires for both
 * authenticated and anonymous users via the ownerId pattern.
 *
 * Mounted once in `__root.tsx` — covers all page navigations app-wide.
 *
 * @param userId - Authenticated user ID. Falls back to localId for anonymous visitors.
 */
export function useTrackingListener(userId: string | undefined) {
  const router = useRouter();
  const { trackEvent } = useWebTracking(userId);

  // Record product views to localStorage for ALL users (anonymous + authenticated).
  // This powers the "Recently Viewed" section on the homepage.
  useEffect(() => {
    const unsubscribe = router.subscribe("onResolved", (event) => {
      const productMatch = event.toLocation.pathname.match(PRODUCT_ROUTE_PATTERN);
      if (productMatch) {
        addToRecentlyViewedStorage(productMatch[1]);
      }
    });
    return unsubscribe;
  }, [router]);

  // Record tracking events via Convex for ALL users (ownerId = userId or localId)
  useEffect(() => {
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

      // Category browsing: /products?category=...
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
  }, [router, trackEvent]);
}
