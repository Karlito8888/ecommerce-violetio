/**
 * Shared profile hooks and query factories (Story 6.1).
 *
 * Uses the "query options factory" pattern for SSR-compatibility:
 * - Route loaders can prefetch with `queryClient.ensureQueryData(profileQueryOptions(...))`
 * - Components consume via `useQuery(profileQueryOptions(...))`
 */

import { queryOptions, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getProfile, updateProfile } from "../clients/profile.js";
import type { UpdateProfilePayload, UserProfile } from "../types/profile.types.js";

export const profileKeys = {
  all: () => ["profile"] as const,
  detail: (userId: string) => ["profile", userId] as const,
};

/**
 * Query options factory for a user's profile.
 * staleTime 5 min matches architecture.md caching spec ("profile 5 min").
 */
export function profileQueryOptions(userId: string) {
  return queryOptions({
    queryKey: profileKeys.detail(userId),
    queryFn: () => getProfile(userId),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Convenience hook for reading a user's profile.
 * Wraps profileQueryOptions so components can consume via `useProfile(userId)`
 * without importing useQuery separately. Disabled when userId is undefined.
 */
export function useProfile(userId: string | undefined) {
  return useQuery({
    ...profileQueryOptions(userId ?? ""),
    enabled: !!userId,
  });
}

/**
 * Mutation hook for updating the user's profile with optimistic UI.
 * Rolls back on error and invalidates the cache on settle.
 */
export function useUpdateProfile(userId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: UpdateProfilePayload) => updateProfile(userId, payload),
    onMutate: async (payload) => {
      await queryClient.cancelQueries({ queryKey: profileKeys.detail(userId) });
      const previous = queryClient.getQueryData<UserProfile | null>(profileKeys.detail(userId));
      if (previous) {
        queryClient.setQueryData<UserProfile>(profileKeys.detail(userId), {
          ...previous,
          ...(payload.display_name !== undefined && { display_name: payload.display_name }),
          ...(payload.avatar_url !== undefined && { avatar_url: payload.avatar_url }),
          ...(payload.preferences !== undefined && {
            preferences: { ...previous.preferences, ...payload.preferences },
          }),
        });
      }
      return { previous };
    },
    onError: (_err, _payload, context) => {
      if (context?.previous) {
        queryClient.setQueryData(profileKeys.detail(userId), context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: profileKeys.detail(userId) });
    },
  });
}
