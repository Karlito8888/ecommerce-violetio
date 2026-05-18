// convex/lib/admin.ts
//
// Vérification du rôle admin — utilisé dans toutes les fonctions admin.
// Le rôle est stocké dans userProfiles.isAdmin (pas dans les JWT).

import type { QueryCtx, MutationCtx } from "../_generated/server";

/**
 * Vérifie que le caller est authentifié ET admin.
 * À appeler en début de chaque query/mutation admin.
 *
 * Accepte QueryCtx et MutationCtx (les deux ont auth + db).
 * Pour les actions (ActionCtx), utiliser checkIsAdmin via ctx.runQuery.
 *
 * Doc: https://docs.convex.dev/auth/functions-auth
 */
export async function assertAdmin(ctx: QueryCtx | MutationCtx): Promise<void> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Not authenticated");

  const profile = await ctx.db
    .query("userProfiles")
    .withIndex("by_userId", (q) => q.eq("userId", identity.subject))
    .first();

  if (!profile?.isAdmin) {
    throw new Error("Admin access required");
  }
}

/**
 * Vérifie que le caller est authentifié.
 * Retourne le userId Convex.
 */
export async function assertAuthenticated(ctx: QueryCtx): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Not authenticated");
  return identity.subject;
}
