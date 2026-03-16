import { useCallback } from "react";
import { createSupabaseClient, useTracking } from "@ecommerce/shared";
import type { TrackingEvent, TrackingEventType } from "@ecommerce/shared";
import { useAuth } from "@/context/AuthContext";

const EDGE_FN_BASE = process.env.EXPO_PUBLIC_SUPABASE_URL
  ? `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/track-event`
  : null;

/**
 * Mobile tracking hook — sends events to the `track-event` Edge Function.
 * Returns `trackEvent` (fire-and-forget, deduped, authenticated-only).
 *
 * ## Security
 * The Edge Function validates the JWT from the Authorization header and
 * extracts `user.id` server-side — the client never supplies a userId.
 * This mirrors the web Server Function pattern (H1 code-review fix).
 *
 * ## Error handling (M4 code-review fix)
 * Fetch errors are now logged with `console.warn` for observability.
 * The `useTracking` hook's try/catch still prevents tracking failures
 * from breaking UX, but failed requests are no longer completely invisible.
 */
export function useMobileTracking() {
  const { user, isAnonymous } = useAuth();
  const userId = user && !isAnonymous ? user.id : undefined;

  const sendEvent = useCallback(async (_userId: string, event: TrackingEvent) => {
    if (!EDGE_FN_BASE) return;

    const supabase = createSupabaseClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) return;

    try {
      const res = await fetch(EDGE_FN_BASE, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          event_type: event.event_type,
          payload: event.payload,
        }),
      });

      if (!res.ok) {
        // eslint-disable-next-line no-console
        console.warn(`[tracking] Edge Function returned ${res.status}:`, await res.text());
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("[tracking] Failed to send event to Edge Function:", err);
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
