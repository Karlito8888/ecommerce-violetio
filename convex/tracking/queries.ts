// convex/tracking/queries.ts
//
// Convex queries for user event tracking reads.
// Replaces packages/shared/src/clients/tracking.ts (Supabase).
//
// Doc: https://docs.convex.dev/database/reading-data

import { query } from "../_generated/server";
import { v } from "convex/values";

/**
 * Reads a user's browsing events, optionally filtered by type.
 * Returns events sorted by creation time (most recent first).
 */
export const getUserEvents = query({
  args: {
    userId: v.string(),
    eventType: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { userId, eventType, limit }) => {
    let q;

    if (eventType) {
      // Use the compound index for filtered queries
      q = ctx.db
        .query("userEvents")
        .withIndex("by_user_type", (q) => q.eq("userId", userId).eq("eventType", eventType))
        .order("desc");
    } else {
      // Use the user + creation time index for all events
      q = ctx.db
        .query("userEvents")
        .withIndex("by_user_created", (q) => q.eq("userId", userId))
        .order("desc");
    }

    if (limit) {
      return await q.take(limit);
    }

    return await q.collect();
  },
});
