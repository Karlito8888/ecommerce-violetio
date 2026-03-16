import { queryOptions, useQuery } from "@tanstack/react-query";
import { getUserEvents } from "../clients/tracking";
import type { TrackingEventType } from "../types/tracking.types";

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
