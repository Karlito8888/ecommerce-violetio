// convex/users/queries.ts
//
// Queries pour la gestion des utilisateurs.
// - getProfile : profil de l'utilisateur connecté
// - getUserById : profil par userId (admin)
// - getIdentity : debug — retourne l'identité Convex Auth

import { query } from "../_generated/server";
import { v } from "convex/values";
import { assertAdmin } from "../lib/admin";

/** Retourne le profil de l'utilisateur connecté. */
export const getProfile = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    return await ctx.db
      .query("userProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", identity.subject))
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

/** Debug — retourne l'identité Convex Auth du caller. */
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
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return false;

    const profile = await ctx.db
      .query("userProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", identity.subject))
      .first();

    return profile?.biometricEnabled ?? false;
  },
});
