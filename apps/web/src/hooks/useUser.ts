// apps/web/src/hooks/useUser.ts
//
// Convex Auth-backed user hook for the web app.
// Replaces the Supabase-based useUser (Phase 5).
//
// Returns the authenticated user's identity or null.
// Used by Header.tsx and other components for auth-gated UI.

import { useConvexAuth } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import { api } from "#convex/_generated/api";

export interface ConvexUser {
  id: string;
  email: string | null;
  name: string | null;
  emailVerified: boolean;
}

interface UseUserResult {
  /** Authenticated user identity, or null */
  data: ConvexUser | null;
  /** Whether auth state is still resolving */
  isLoading: boolean;
  /** Whether the user is authenticated */
  isAuthenticated: boolean;
}

/**
 * Returns the authenticated user's identity from Convex Auth.
 * The identity query is skipped when not authenticated.
 */
export function useUser(): UseUserResult {
  const { isAuthenticated, isLoading } = useConvexAuth();

  const identity = useQuery(api.users.queries.getIdentity, isAuthenticated ? {} : "skip");

  const data: ConvexUser | null =
    isAuthenticated && identity
      ? {
          id: identity.subject,
          email: identity.email ?? null,
          name: identity.name ?? null,
          emailVerified: identity.emailVerified ?? false,
        }
      : null;

  return { data, isLoading, isAuthenticated };
}
