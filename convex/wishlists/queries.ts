// convex/wishlists/queries.ts
//
// Convex queries for wishlist reads.
// Replaces packages/shared/src/clients/wishlist.ts (Supabase).
//
// Design decisions (carried over from Supabase implementation):
//   - productId is a string (Violet product IDs are opaque strings, not UUID FKs)
//   - No price caching — Violet is the source of truth for product data
//   - Convex queries are reactive by default — cross-device sync is automatic
//
// Doc: https://docs.convex.dev/database/reading-data

import { query } from "../_generated/server";
import { v } from "convex/values";

/**
 * Fetches the user's wishlist with all items.
 * Returns null if no wishlist exists yet (first-time user).
 *
 * Items are returned sorted by creation time (most recent first).
 */
export const getWishlist = query({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const wishlist = await ctx.db
      .query("wishlists")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();

    if (!wishlist) return null;

    const items = await ctx.db
      .query("wishlistItems")
      .withIndex("by_wishlistId", (q) => q.eq("wishlistId", wishlist._id))
      .order("desc")
      .collect();

    return {
      _id: wishlist._id,
      userId: wishlist.userId,
      items: items.map((item) => ({
        _id: item._id,
        productId: item.productId,
        _creationTime: item._creationTime,
      })),
      _creationTime: wishlist._creationTime,
    };
  },
});

/**
 * Returns an array of product IDs in the user's wishlist.
 * Lightweight alternative to getWishlist() for heart icon state on product cards.
 */
export const getWishlistProductIds = query({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const wishlist = await ctx.db
      .query("wishlists")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();

    if (!wishlist) return [];

    const items = await ctx.db
      .query("wishlistItems")
      .withIndex("by_wishlistId", (q) => q.eq("wishlistId", wishlist._id))
      .collect();

    return items.map((item) => item.productId);
  },
});
