// Mobile tracking hook — migrated from Supabase to Convex mutations (Phase 6).
//
// Uses Convex useMutation(api.tracking.mutations.recordEvent) instead of
// the web backend /api/track-event endpoint (which routed to Supabase).
//
// Key difference: The Convex mutation accepts userId directly (Convex userId or localId).
// No JWT extraction server-side needed — the mutation is public (no auth required).

import { useCallback } from "react";
import { useMutation } from "convex/react";
import { api } from "#convex/_generated/api";

import { useAuth } from "@/context/AuthContext";
import { useTracking } from "@ecommerce/shared";
import type { TrackingEvent, TrackingEventType } from "@ecommerce/shared";

/**
 * Mobile tracking hook — sends events to Convex.
 * Returns `trackEvent` (fire-and-forget, supports authenticated + anonymous).
 *
 * ## Security
 * The Convex mutation recordEvent is public — it accepts any userId string.
 * This is fine because tracking events are non-sensitive analytics data.
 *
 * ## Error handling
 * Fetch errors are caught silently. Tracking failures never break UX.
 */
export function useMobileTracking() {
  const { userId: authUserId, isAuthenticated, localId } = useAuth();
  const recordEvent = useMutation(api.tracking.mutations.recordEvent);

  // Use Convex userId if authenticated, otherwise use localId (anonymous)
  const userId = isAuthenticated ? (authUserId ?? localId) : localId;

  const sendEvent = useCallback(
    async (_userId: string, event: TrackingEvent) => {
      try {
        await recordEvent({
          userId,
          eventType: event.event_type,
          payload: event.payload,
        });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn("[tracking] Failed to send event:", err);
      }
    },
    [userId, recordEvent],
  );

  return useTracking({ userId: userId ?? undefined, sendEvent });
}

/**
 * Convenience: track a product view. Call from `useFocusEffect` in product detail.
 */
export function useTrackProductView(productId: string | undefined) {
  const { trackEvent } = useMobileTracking();

  const trackProductView = useCallback(() => {
    if (!productId) return;
    trackEvent({
      event_type: "product_view" as TrackingEventType,
      payload: { product_id: productId },
    });
  }, [productId, trackEvent]);

  return trackProductView;
}
