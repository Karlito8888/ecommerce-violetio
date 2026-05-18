// apps/web/src/hooks/useAuthSession.ts
//
// Convex Auth-backed session hook for the web app.
// Replaces the Supabase-based useAuthSession (Phase 5).
//
// Key differences from Supabase:
//   - No anonymous session — localId model (crypto.randomUUID in localStorage)
//   - No session object — Convex Auth manages tokens internally
//   - userId comes from Convex Auth identity (subject field)
//
// Consumers:
//   - __root.tsx: userId for CartProvider + tracking
//   - CartContext.tsx: userId for cart merge

import { useConvexAuth } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import { useMemo } from "react";
import { api } from "#convex/_generated/api";
import { getOrCreateLocalId } from "@ecommerce/shared";

export interface WebAuthSession {
  /** Convex Auth user ID (subject), or null if not authenticated */
  userId: string | null;
  /** User email, or null */
  email: string | null;
  /** localId for anonymous visitors (persisted in localStorage) */
  localId: string;
  /** Whether Convex Auth session is active */
  isAuthenticated: boolean;
  /** Whether auth state is still resolving */
  isLoading: boolean;
}

/**
 * Provides the current auth state backed by Convex Auth.
 *
 * - Authenticated: userId and email from Convex Auth identity query
 * - Anonymous (visitor): localId from localStorage, no server session
 * - Loading: Convex Auth is resolving the initial state
 *
 * The identity query is skipped ("skip") when not authenticated to avoid
 * unnecessary server calls. Convex will not execute the query in that case.
 */
export function useAuthSession(): WebAuthSession {
  const { isAuthenticated, isLoading } = useConvexAuth();

  const identity = useQuery(api.users.queries.getIdentity, isAuthenticated ? {} : "skip");

  const localId = useMemo(() => {
    if (typeof window === "undefined") return "";
    return getOrCreateLocalId();
  }, []);

  return {
    userId: isAuthenticated && identity ? identity.subject : null,
    email: isAuthenticated && identity ? (identity.email ?? null) : null,
    localId,
    isAuthenticated,
    isLoading,
  };
}
