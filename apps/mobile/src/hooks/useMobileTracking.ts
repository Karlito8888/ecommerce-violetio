import { useCallback } from "react";
import { useTracking } from "@ecommerce/shared";
import type { TrackingEvent, TrackingEventType } from "@ecommerce/shared";
import { useAuth } from "@/context/AuthContext";
import { apiPost } from "@/server/apiClient";

/**
 * Mobile tracking hook — sends events to the web backend `/api/track-event`.
 * Returns `trackEvent` (fire-and-forget, deduped, authenticated-only).
 *
 * ## Security
 * The web backend validates the JWT from the Authorization header and
 * extracts `user.id` server-side — the client never supplies a userId.
 *
 * ## Error handling
 * Fetch errors are logged with `console.warn` for observability.
 * The `useTracking` hook's try/catch still prevents tracking failures
 * from breaking UX.
 */
export function useMobileTracking() {
  const { user, isAnonymous } = useAuth();
  const userId = user && !isAnonymous ? user.id : undefined;

  const sendEvent = useCallback(async (_userId: string, event: TrackingEvent) => {
    try {
      await apiPost("/api/track-event", {
        event_type: event.event_type,
        payload: event.payload,
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("[tracking] Failed to send event:", err);
    }
  }, []);

  return useTracking({ userId, sendEvent });
}

/**
 * Convenience: track a product view. Call from `useFocusEffect` in product detail.
 *
 * M1 note: only `product_id` is sent — `offer_id` and `category` are not
 * available from route params alone. These optional fields will be populated
 * by downstream consumers (Stories 6.3, 6.5) at query time by JOINing
 * `user_events` with the product catalog.
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
