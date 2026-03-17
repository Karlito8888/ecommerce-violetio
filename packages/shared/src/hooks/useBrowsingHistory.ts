import { queryOptions, useQuery } from "@tanstack/react-query";
/**
 * M6 review fix: Added .js extensions to local imports for ESM consistency.
 *
 * Several Epic 6 files used extensionless imports (`./tracking` instead of
 * `./tracking.js`). While the bundler resolves both, strict ESM resolution
 * requires the extension. The rest of the codebase uses .js consistently.
 */
import { getUserEvents } from "../clients/tracking.js";
import type { TrackingEventType } from "../types/tracking.types.js";

export const browsingHistoryKeys = {
  all: (userId: string) => ["browsingHistory", userId] as const,
  byType: (userId: string, type: TrackingEventType) => ["browsingHistory", userId, type] as const,
};

export function browsingHistoryQueryOptions(
  userId: string | undefined,
  eventType?: TrackingEventType,
  limit = 50,
) {
  return queryOptions({
    queryKey: eventType
      ? browsingHistoryKeys.byType(userId ?? "", eventType)
      : browsingHistoryKeys.all(userId ?? ""),
    queryFn: () => getUserEvents(userId!, { eventType, limit }),
    enabled: !!userId,
    staleTime: 2 * 60 * 1000, // 2 min — browsing history changes frequently
  });
}

export function useBrowsingHistory(
  userId: string | undefined,
  eventType?: TrackingEventType,
  limit = 50,
) {
  return useQuery(browsingHistoryQueryOptions(userId, eventType, limit));
}
