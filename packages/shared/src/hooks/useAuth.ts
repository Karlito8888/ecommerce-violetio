/**
 * Shared auth hooks for declarative React consumption (Story 6.1).
 *
 * These wrap the imperative auth functions from `clients/auth.ts` with
 * TanStack Query mutations for loading/error state management.
 *
 * Note: existing login/signup pages call auth functions directly and do NOT
 * need to migrate to these hooks — they are provided for new UI and future use.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createSupabaseClient } from "../clients/supabase.js";
import { signInWithEmail, signUpWithEmail, signOut } from "../clients/auth.js";
import { queryKeys } from "../utils/constants.js";

/**
 * Returns the current Supabase user object, or null if not authenticated.
 * Uses `staleTime: Infinity` because the user session is updated via
 * `onAuthStateChange` listeners, not by polling.
 */
export function useUser() {
  const supabase = createSupabaseClient();
  return useQuery({
    queryKey: queryKeys.user.current(),
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      return user;
    },
    staleTime: Infinity,
  });
}

/** Mutation hook for email/password sign-in. */
export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      signInWithEmail(email, password),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.user.current() });
    },
  });
}

/**
 * Mutation hook for account registration (anonymous → email conversion).
 * Wraps signUpWithEmail which links an email to the current anonymous user.
 */
export function useRegister() {
  return useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      signUpWithEmail(email, password),
  });
}

/** Mutation hook for sign-out. Clears user and profile caches. */
export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => signOut(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.user.current() });
      queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
  });
}
