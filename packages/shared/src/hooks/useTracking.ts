import { useCallback, useRef } from "react";
/** M6 review fix: Added .js extension for ESM consistency. */
import type { TrackingEvent } from "../types/tracking.types.js";

interface UseTrackingOptions {
  userId: string | undefined;
  /** Platform-specific function to send the event to the server. */
  sendEvent: (userId: string, event: TrackingEvent) => Promise<void>;
}

/**
 * Dedup window in milliseconds.
 * Events with the same dedup key within this window are silently dropped.
 * 60 seconds matches AC #2 ("only one event per unique query within a 60-second window").
 */
const DEDUP_WINDOW_MS = 60_000;

/**
 * Max entries before pruning stale dedup keys.
 *
 * L2 code-review fix: lowered from 100 to 50 for more aggressive cleanup.
 * In practice, a user browsing normally generates ~1-2 events per page
 * navigation, so 50 entries covers ~25-50 page views — well beyond
 * what fits in a 60-second window. The pruning only removes expired
 * entries, so active dedup keys are never lost.
 */
const PRUNE_THRESHOLD = 50;

/**
 * Hook providing a fire-and-forget `trackEvent()` function.
 *
 * - Skips anonymous users (userId must be defined).
 * - Deduplicates same event_type + key within a 60 s window.
 * - Silently swallows errors — tracking must never break UX.
 *
 * The actual network call is delegated to the caller-supplied `sendEvent`,
 * making this hook platform-agnostic (web → Server Function, mobile → Edge Function).
 *
 * ## Dedup strategy
 * Client-side only, using an in-memory Map keyed by `getDedupKey()`.
 * Cross-device dedup is intentionally not handled — viewing a product on
 * web and then mobile counts as 2 views, which is correct for personalization.
 */
export function useTracking({ userId, sendEvent }: UseTrackingOptions) {
  const recentEvents = useRef<Map<string, number>>(new Map());

  const trackEvent = useCallback(
    async (event: TrackingEvent) => {
      if (!userId) return;

      const dedupKey = getDedupKey(event);
      const now = Date.now();
      const lastFired = recentEvents.current.get(dedupKey);

      if (lastFired && now - lastFired < DEDUP_WINDOW_MS) {
        return; // duplicate within window
      }

      recentEvents.current.set(dedupKey, now);

      // Prune stale entries to prevent memory leaks (L2 code-review fix)
      if (recentEvents.current.size > PRUNE_THRESHOLD) {
        for (const [key, ts] of recentEvents.current) {
          if (now - ts > DEDUP_WINDOW_MS) {
            recentEvents.current.delete(key);
          }
        }
      }

      try {
        await sendEvent(userId, event);
      } catch {
        // Silently ignore — tracking failures don't affect UX
      }
    },
    [userId, sendEvent],
  );

  return { trackEvent };
}

/**
 * Derives a dedup key from a tracking event.
 *
 * The key is `event_type:identifier` where the identifier depends on the
 * event type — e.g., `product_view:abc-123`, `search:red shoes`.
 *
 * M2 code-review fix: exported so tests can import the real function
 * instead of duplicating the logic (which would silently diverge on changes).
 *
 * @param event - The tracking event to derive the key from.
 * @returns A string key for dedup Map lookups.
 */
export function getDedupKey(event: TrackingEvent): string {
  const p = event.payload;
  switch (event.event_type) {
    case "product_view":
      return `product_view:${(p as { product_id: string }).product_id}`;
    case "search":
      return `search:${(p as { query: string }).query}`;
    case "category_view":
      return `category_view:${(p as { category_id: string }).category_id}`;
    default:
      return `${event.event_type}:${JSON.stringify(p)}`;
  }
}
