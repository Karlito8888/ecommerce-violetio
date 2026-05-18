// convex/tracking/mutations.ts
//
// Convex mutations for user event tracking.
// Replaces packages/shared/src/clients/tracking.ts (Supabase).
//
// Design: Tracking failures must not break UX — errors are caught and logged.
// In Convex, throwing in a mutation rolls back the transaction, which is fine
// since tracking inserts are independent of other operations.
//
// Doc: https://docs.convex.dev/database/writing-data

import { mutation } from "../_generated/server";
import { v } from "convex/values";

/**
 * Records a tracking event.
 * userId can be a Convex auth userId or a localId (anonymous visitor).
 */
export const recordEvent = mutation({
  args: {
    userId: v.string(),
    eventType: v.string(),
    payload: v.optional(v.any()),
  },
  handler: async (ctx, { userId, eventType, payload }) => {
    await ctx.db.insert("userEvents", {
      userId,
      eventType,
      payload,
    });
  },
});
