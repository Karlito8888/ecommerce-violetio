// packages/shared/src/hooks/convex/useTracking.ts
//
// Convex-based tracking hooks.
// Replaces the Supabase-based tracking client during migration.
//
// The dedup logic from useTracking.ts is unchanged — only the
// mutation call switches from Supabase to Convex.

import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";

/**
 * Returns a mutation function to record a tracking event via Convex.
 * Drop-in replacement for the Supabase-based sendEvent callback.
 */
export function useRecordEvent() {
  return useMutation(api.tracking.mutations.recordEvent);
}

/**
 * Reactive hook for user browsing events.
 * Returns events sorted by creation time (most recent first).
 */
export function useUserEventsConvex(
  userId: string | undefined,
  eventType?: string,
  limit?: number,
) {
  return useQuery(
    api.tracking.queries.getUserEvents,
    userId ? { userId, eventType, limit } : "skip",
  );
}
