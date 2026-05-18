// convex/lib/admin.ts
//
// Vérification du rôle admin — utilisé dans toutes les fonctions admin.
// Le rôle est stocké dans userProfiles.isAdmin (pas dans les JWT).

import { getAuthUserId } from "@convex-dev/auth/server";
import type { QueryCtx, MutationCtx } from "../_generated/server";

/**
 * Vérifie que le caller est authentifié ET admin.
 * À appeler en début de chaque query/mutation admin.
 *
 * Accepte QueryCtx et MutationCtx (les deux ont auth + db).
 * Pour les actions (ActionCtx), utiliser checkIsAdmin via ctx.runQuery.
 *
 * Uses getAuthUserId() — the official Convex Auth API for getting
 * the current user's document ID from the auth `users` table.
 *
 * Doc: https://labs.convex.dev/auth/authz
 */
export async function assertAdmin(ctx: QueryCtx | MutationCtx): Promise<void> {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Not authenticated");

  const profile = await ctx.db
    .query("userProfiles")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .first();

  if (!profile?.isAdmin) {
    throw new Error("Admin access required");
  }
}

/**
 * Vérifie que le caller est authentifié.
 * Retourne le userId Convex (document ID from the auth `users` table).
 *
 * Uses getAuthUserId() — the official Convex Auth API.
 * Doc: https://labs.convex.dev/auth/authz
 */
export async function assertAuthenticated(ctx: QueryCtx | MutationCtx): Promise<string> {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Not authenticated");
  return userId;
}
