// convex/users/queries.ts
//
// Queries for user management.
// - getProfile : profile of the authenticated user
// - getUserById : profile by userId (admin-only)
// - getIdentity : returns the Convex Auth identity of the caller
// - getBiometricPreference : biometricEnabled flag for mobile

import { query } from "../_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { assertAdmin } from "../lib/admin";

/** Returns the profile of the authenticated user. Uses getAuthUserId(). */
export const getProfile = query({
  args: {},
  returns: v.union(
    v.object({
      _id: v.id("userProfiles"),
      _creationTime: v.number(),
      userId: v.string(),
      displayName: v.optional(v.string()),
      avatarUrl: v.optional(v.string()),
      preferences: v.record(v.string(), v.any()),
      biometricEnabled: v.boolean(),
      isAdmin: v.optional(v.boolean()),
    }),
    v.null(),
  ),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    return await ctx.db
      .query("userProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();
  },
});

/** Returns a profile by userId. Admin-only. */
export const getUserById = query({
  args: { userId: v.string() },
  returns: v.union(
    v.object({
      _id: v.id("userProfiles"),
      _creationTime: v.number(),
      userId: v.string(),
      displayName: v.optional(v.string()),
      avatarUrl: v.optional(v.string()),
      preferences: v.record(v.string(), v.any()),
      biometricEnabled: v.boolean(),
      isAdmin: v.optional(v.boolean()),
    }),
    v.null(),
  ),
  handler: async (ctx, { userId }) => {
    await assertAdmin(ctx);
    return await ctx.db
      .query("userProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();
  },
});

/**
 * Returns the Convex Auth identity of the caller.
 * Used by useAuthSession(), useUser(), AuthContext (mobile), and __root.tsx.
 * This query intentionally uses ctx.auth.getUserIdentity() instead of
 * getAuthUserId() because it returns raw identity fields (email, name, etc.)
 * that the client needs for display purposes.
 */
export const getIdentity = query({
  args: {},
  returns: v.union(
    v.object({
      subject: v.string(),
      name: v.optional(v.union(v.string(), v.null())),
      email: v.optional(v.union(v.string(), v.null())),
      emailVerified: v.optional(v.union(v.boolean(), v.null())),
    }),
    v.null(),
  ),
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
 * Returns the biometricEnabled flag for the authenticated user.
 * Replaces getBiometricPreference() from @ecommerce/shared (Supabase).
 */
export const getBiometricPreference = query({
  args: {},
  returns: v.boolean(),
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
