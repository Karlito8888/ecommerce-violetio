// convex/wishlists/mutations.ts
//
// Convex mutations for wishlist writes.
// Replaces packages/shared/src/clients/wishlist.ts (Supabase).
//
// Patterns:
//   - Upsert wishlist: first() → insert if missing (replaces Supabase ON CONFLICT)
//   - Idempotent add: check existing before insert (replaces ON CONFLICT DO NOTHING)
//   - Graceful remove: no-op if wishlist or item doesn't exist
//
// Doc: https://docs.convex.dev/database/writing-data

import { mutation } from "../_generated/server";
import { v } from "convex/values";

/**
 * Adds a product to the user's wishlist.
 * Creates the wishlist row if it doesn't exist.
 * Idempotent — no error if the product is already wishlisted.
 */
export const addToWishlist = mutation({
  args: { userId: v.string(), productId: v.string() },
  returns: v.null(),
  handler: async (ctx, { userId, productId }) => {
    // Find or create the wishlist
    let wishlist = await ctx.db
      .query("wishlists")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();

    if (!wishlist) {
      const id = await ctx.db.insert("wishlists", { userId });
      wishlist = await ctx.db.get("wishlists", id);
      if (!wishlist) throw new Error("Failed to create wishlist");
    }

    // Check if already wishlisted (idempotent)
    const existing = await ctx.db
      .query("wishlistItems")
      .withIndex("by_wishlistId_productId", (q) =>
        q.eq("wishlistId", wishlist._id).eq("productId", productId),
      )
      .first();

    if (!existing) {
      await ctx.db.insert("wishlistItems", {
        wishlistId: wishlist._id,
        productId,
      });
    }
  },
});

/**
 * Removes a product from the user's wishlist.
 * No-op if the wishlist or the item doesn't exist.
 */
export const removeFromWishlist = mutation({
  args: { userId: v.string(), productId: v.string() },
  returns: v.null(),
  handler: async (ctx, { userId, productId }) => {
    const wishlist = await ctx.db
      .query("wishlists")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();

    if (!wishlist) return; // No wishlist = nothing to remove

    const item = await ctx.db
      .query("wishlistItems")
      .withIndex("by_wishlistId_productId", (q) =>
        q.eq("wishlistId", wishlist._id).eq("productId", productId),
      )
      .first();

    if (item) {
      await ctx.db.delete("wishlistItems", item._id);
    }
  },
});
