// convex/users/queries.ts
//
// Queries pour la gestion des utilisateurs.
// - getProfile : profil de l'utilisateur connecté
// - getUserById : profil par userId (admin)
// - getIdentity : debug — retourne l'identité Convex Auth
// - getBiometricPreference : flag biometricEnabled pour le mobile

import { query } from "../_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { assertAdmin } from "../lib/admin";

/** Retourne le profil de l'utilisateur connecté. Uses getAuthUserId(). */
export const getProfile = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    return await ctx.db
      .query("userProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();
  },
});

/** Retourne un profil par userId. Admin-only. */
export const getUserById = query({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    await assertAdmin(ctx);
    return await ctx.db
      .query("userProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();
  },
});

/**
 * Debug — retourne l'identité Convex Auth du caller.
 * This query intentionally uses ctx.auth.getUserIdentity() instead of
 * getAuthUserId() because it returns raw identity fields (email, name, etc.)
 * that the client needs for display purposes.
 */
export const getIdentity = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    return {
      subject: identity.subject,
      name: identity.name,
      email: identity.email,
      emailVerified: identity.emailVerified,
    };
  },
});

/**
 * Retourne le flag biometricEnabled pour l'utilisateur connecté.
 * Remplace getBiometricPreference() de @ecommerce/shared (Supabase).
 */
export const getBiometricPreference = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return false;

    const profile = await ctx.db
      .query("userProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();

    return profile?.biometricEnabled ?? false;
  },
});
