/**
 * Shared notification preferences hooks (Story 6.7).
 *
 * Follows the same direct-import pattern as useWishlist and useProfile
 * (Supabase-only features don't need the adapter pattern).
 *
 * Preferences use a "defaults + sparse overrides" model:
 * - DB stores only explicitly changed preferences
 * - Hook merges with DEFAULT_NOTIFICATION_PREFERENCES
 * - Result is always a complete NotificationPreferencesMap
 */

import { queryOptions, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getNotificationPreferences,
  upsertNotificationPreference,
} from "../clients/notifications.js";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  type NotificationType,
  type NotificationPreferencesMap,
} from "../types/notification.types.js";
import { queryKeys } from "../utils/constants.js";

/**
 * Merges sparse DB rows with defaults to produce a complete preferences map.
 * If a type has no DB row, the default is used (transactional: true, marketing: false).
 */
export function mergeWithDefaults(
  dbPreferences: Array<{ notification_type: NotificationType; enabled: boolean }>,
): NotificationPreferencesMap {
  const merged = { ...DEFAULT_NOTIFICATION_PREFERENCES };
  for (const pref of dbPreferences) {
    merged[pref.notification_type] = pref.enabled;
  }
  return merged;
}

/** Query options for notification preferences — staleTime 5 min (matches profile). */
export function notificationPreferencesQueryOptions(userId: string) {
  return queryOptions({
    queryKey: queryKeys.notifications.preferences(userId),
    queryFn: async () => {
      const rows = await getNotificationPreferences(userId);
      return mergeWithDefaults(rows);
    },
    staleTime: 5 * 60 * 1000,
  });
}

/** Hook for fetching notification preferences with defaults merged. */
export function useNotificationPreferences(userId: string | undefined) {
  return useQuery({
    ...notificationPreferencesQueryOptions(userId ?? ""),
    enabled: !!userId,
  });
}

/** Mutation hook for toggling a single notification preference with optimistic update. */
export function useUpdateNotificationPreference(userId: string | undefined) {
  const queryClient = useQueryClient();
  const key = queryKeys.notifications.preferences(userId ?? "");

  return useMutation({
    mutationFn: ({ type, enabled }: { type: NotificationType; enabled: boolean }) => {
      if (!userId) throw new Error("userId required");
      return upsertNotificationPreference(userId, type, enabled);
    },
    onMutate: async ({ type, enabled }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<NotificationPreferencesMap>(key);
      queryClient.setQueryData<NotificationPreferencesMap>(key, (old) =>
        old ? { ...old, [type]: enabled } : undefined,
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(key, context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: key });
    },
  });
}
