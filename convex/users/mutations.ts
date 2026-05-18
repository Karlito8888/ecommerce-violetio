// convex/users/mutations.ts
//
// Mutations for user management and anonymous → authenticated data migration.
// The localId model (see packages/shared/src/utils/localId.ts) associates pre-signup
// data with a local UUID. On signup, this data is migrated to the Convex Auth userId
// via migrateAnonymousData().

import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

/**
 * Migrates data associated with a localId to a Convex Auth userId.
 * Called once after a successful signup.
 *
 * Migrated data:
 *   - wishlists + wishlist_items (userId: localId → userId)
 *   - user_events (userId: localId → userId)
 *   - notification_preferences (userId: localId → userId)
 *   - user_push_tokens (userId: localId → userId)
 *   - active carts (userId: localId → userId)
 */
export const migrateAnonymousData = mutation({
  args: {
    localId: v.string(),
  },
  returns: v.object({
    migrated: v.object({
      wishlists: v.number(),
      events: v.number(),
      preferences: v.number(),
      pushTokens: v.number(),
      carts: v.number(),
    }),
  }),
  handler: async (ctx, { localId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated — cannot migrate anonymous data");
    }

    // 1. Migrate the wishlist
    const anonWishlist = await ctx.db
      .query("wishlists")
      .withIndex("by_userId", (q) => q.eq("userId", localId))
      .first();

    if (anonWishlist) {
      // Check if the user already has a wishlist (created by afterUserCreatedOrUpdated)
      const existingWishlist = await ctx.db
        .query("wishlists")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .first();

      if (existingWishlist) {
        // Merge: move anonymous items into the existing wishlist, then delete the anon wishlist
        const anonItems = await ctx.db
          .query("wishlistItems")
          .withIndex("by_wishlistId", (q) => q.eq("wishlistId", anonWishlist._id))
          .collect();

        for (const item of anonItems) {
          // Skip duplicates (product already in user's wishlist)
          const existingItem = await ctx.db
            .query("wishlistItems")
            .withIndex("by_wishlistId_productId", (q) =>
              q.eq("wishlistId", existingWishlist._id).eq("productId", item.productId),
            )
            .first();

          if (!existingItem) {
            await ctx.db.insert("wishlistItems", {
              wishlistId: existingWishlist._id,
              productId: item.productId,
            });
          }
          await ctx.db.delete("wishlistItems", item._id);
        }
        // Remove the empty anonymous wishlist
        await ctx.db.delete("wishlists", anonWishlist._id);
      } else {
        // No existing wishlist — simply reassign ownership
        await ctx.db.patch("wishlists", anonWishlist._id, { userId });
      }
    }

    // 2. Migrate user events
    const events = await ctx.db
      .query("userEvents")
      .withIndex("by_user_type", (q) => q.eq("userId", localId))
      .collect();
    for (const event of events) {
      await ctx.db.patch("userEvents", event._id, { userId });
    }

    // 3. Migrate notification preferences
    const prefs = await ctx.db
      .query("notificationPreferences")
      .withIndex("by_userId_type", (q) => q.eq("userId", localId))
      .collect();
    for (const pref of prefs) {
      await ctx.db.patch("notificationPreferences", pref._id, { userId });
    }

    // 4. Migrate push tokens
    const tokens = await ctx.db
      .query("userPushTokens")
      .withIndex("by_userId", (q) => q.eq("userId", localId))
      .collect();
    for (const token of tokens) {
      await ctx.db.patch("userPushTokens", token._id, { userId });
    }

    // 5. Migrate active carts
    const carts = await ctx.db
      .query("carts")
      .withIndex("by_userId", (q) => q.eq("userId", localId))
      .collect();
    for (const cart of carts) {
      if (cart.status === "active") {
        await ctx.db.patch("carts", cart._id, { userId });
      }
    }

    return {
      migrated: {
        wishlists: anonWishlist ? 1 : 0,
        events: events.length,
        preferences: prefs.length,
        pushTokens: tokens.length,
        carts: carts.filter((c) => c.status === "active").length,
      },
    };
  },
});

/**
 * Updates the authenticated user's profile.
 */
export const updateProfile = mutation({
  args: {
    displayName: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    preferences: v.optional(v.record(v.string(), v.any())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const profile = await ctx.db
      .query("userProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();

    if (!profile) throw new Error("Profile not found");

    await ctx.db.patch("userProfiles", profile._id, {
      ...(args.displayName !== undefined && { displayName: args.displayName }),
      ...(args.avatarUrl !== undefined && { avatarUrl: args.avatarUrl }),
      ...(args.preferences !== undefined && { preferences: args.preferences }),
    });
  },
});

/**
 * Enables or disables the biometricEnabled flag on the user's profile.
 * Replaces setBiometricPreference() from @ecommerce/shared (Supabase).
 */
export const setBiometricPreference = mutation({
  args: { enabled: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { enabled }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const profile = await ctx.db
      .query("userProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();

    if (profile) {
      await ctx.db.patch("userProfiles", profile._id, { biometricEnabled: enabled });
    }
  },
});
