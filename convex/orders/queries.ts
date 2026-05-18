// convex/orders/queries.ts
//
// Convex queries for orders (user-facing + admin + guest lookup).
// Replaces apps/web/src/server/orders.ts + guestOrders.ts (Supabase).
//
// Doc: https://docs.convex.dev/database/reading-data
// Best practices: https://docs.convex.dev/understanding/best-practices
// - Use Promise.all() to parallelize independent reads
// - Always pass table name as first arg to ctx.db.get/patch/delete
// - Use .take() to bound query results

import { query } from "../_generated/server";
import type { QueryCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { v } from "convex/values";
import { assertAdmin } from "../lib/admin";

type EnrichedOrder = Doc<"orders"> & {
  bags: (Doc<"orderBags"> & {
    items: Doc<"orderItems">[];
    refunds: Doc<"orderRefunds">[];
  })[];
};

/**
 * Enriches a single order with its bags, items, and refunds.
 * Uses Promise.all() to parallelize independent reads per bag.
 */
async function enrichOrderWithBags(ctx: QueryCtx, order: Doc<"orders">): Promise<EnrichedOrder> {
  const bags = await ctx.db
    .query("orderBags")
    .withIndex("by_orderId", (q) => q.eq("orderId", order._id))
    .collect();

  // Parallelize: fetch items + refunds for each bag concurrently
  const bagsWithItems = await Promise.all(
    bags.map(async (bag) => {
      const [items, refunds] = await Promise.all([
        ctx.db
          .query("orderItems")
          .withIndex("by_orderBagId", (q) => q.eq("orderBagId", bag._id))
          .collect(),
        ctx.db
          .query("orderRefunds")
          .withIndex("by_orderBagId", (q) => q.eq("orderBagId", bag._id))
          .collect(),
      ]);
      return { ...bag, items, refunds };
    }),
  );

  return { ...order, bags: bagsWithItems };
}

/**
 * Get orders for a user (authenticated), newest first.
 * Includes bags, items, and refunds for each order.
 *
 * Uses .take(limit) to bound the number of orders and avoid unbounded reads.
 * Default limit of 50 covers realistic usage; clients can paginate if needed.
 */
export const getOrders = query({
  args: { userId: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { userId, limit }) => {
    const maxOrders = limit ?? 50;
    const orders = await ctx.db
      .query("orders")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .order("desc")
      .take(maxOrders);

    // Parallelize enrichment of all orders
    return Promise.all(orders.map((order) => enrichOrderWithBags(ctx, order)));
  },
});

/**
 * Get a single order by its Convex ID, with full details.
 *
 * Access control:
 *   - Owner: the user whose userId matches order.userId
 *   - Admin: any user with isAdmin=true in their profile
 *   - Guest: orders without a userId (guest checkout) are readable by anyone
 */
export const getOrderDetail = query({
  args: { orderId: v.id("orders") },
  handler: async (ctx, { orderId }) => {
    const order = await ctx.db.get("orders", orderId);
    if (!order) return null;

    // Ownership check — allow access if owner, admin, or guest order (no userId)
    if (order.userId) {
      const identity = await ctx.auth.getUserIdentity();
      if (identity && order.userId !== identity.subject) {
        // Not the owner — check if admin
        const profile = await ctx.db
          .query("userProfiles")
          .withIndex("by_userId", (q) => q.eq("userId", identity.subject))
          .first();
        if (!profile?.isAdmin) return null;
      }
    }

    return enrichOrderWithBags(ctx, order);
  },
});

/**
 * Guest order lookup by token hash (no auth required).
 * Used for the /order/lookup page where guests track orders by email + order number.
 */
export const getGuestOrderByToken = query({
  args: { orderLookupTokenHash: v.string() },
  handler: async (ctx, { orderLookupTokenHash }) => {
    const order = await ctx.db
      .query("orders")
      .withIndex("by_lookupToken", (q) => q.eq("orderLookupTokenHash", orderLookupTokenHash))
      .first();

    if (!order) return null;

    const bags = await ctx.db
      .query("orderBags")
      .withIndex("by_orderId", (q) => q.eq("orderId", order._id))
      .collect();

    // Parallelize: fetch items for each bag concurrently
    const bagsWithItems = await Promise.all(
      bags.map(async (bag) => {
        const items = await ctx.db
          .query("orderItems")
          .withIndex("by_orderBagId", (q) => q.eq("orderBagId", bag._id))
          .collect();
        return { ...bag, items };
      }),
    );

    return { ...order, bags: bagsWithItems };
  },
});

/**
 * Get all orders (admin). Includes basic bag count per order.
 */
export const getAllOrders = query({
  args: {
    status: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { status, limit: maxOrders }) => {
    await assertAdmin(ctx);
    const limit = maxOrders ?? 100;

    if (status) {
      return await ctx.db
        .query("orders")
        .withIndex("by_status", (q) => q.eq("status", status))
        .order("desc")
        .take(limit);
    }

    return await ctx.db.query("orders").order("desc").take(limit);
  },
});
