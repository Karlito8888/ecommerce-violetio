// packages/shared/src/hooks/convex/useProfile.ts
//
// Convex-based profile hooks.
// Replaces the Supabase-based useProfile.ts during migration.

import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";

/** Reactive profile for the currently authenticated user. */
export function useProfileConvex() {
  return useQuery(api.users.queries.getProfile, {});
}

/**
 * Mutation: update the current user's profile.
 * Only the provided fields are updated (partial update via patch).
 */
export function useUpdateProfileConvex() {
  return useMutation(api.users.mutations.updateProfile);
}
