// packages/shared/src/hooks/convex/useNotifications.ts
//
// Convex-based notification hooks.
// Replaces the Supabase-based notification client during migration.

import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";

/** Reactive push tokens for a user. */
export function usePushTokensConvex(userId: string | undefined) {
  return useQuery(api.notifications.queries.getUserPushTokens, userId ? { userId } : "skip");
}

/** Reactive notification preferences for a user. */
export function useNotificationPreferencesConvex(userId: string | undefined) {
  return useQuery(
    api.notifications.queries.getNotificationPreferences,
    userId ? { userId } : "skip",
  );
}

/** Mutation: upsert a push token. */
export function useUpsertPushToken() {
  return useMutation(api.notifications.mutations.upsertPushToken);
}

/** Mutation: delete a push token. */
export function useDeletePushToken() {
  return useMutation(api.notifications.mutations.deletePushToken);
}

/** Mutation: upsert a notification preference. */
export function useUpsertNotificationPreference() {
  return useMutation(api.notifications.mutations.upsertNotificationPreference);
}
