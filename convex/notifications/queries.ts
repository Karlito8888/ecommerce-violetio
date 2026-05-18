// convex/notifications/queries.ts
//
// Convex queries for push tokens and notification preferences.
// Replaces packages/shared/src/clients/notifications.ts (Supabase read functions).
//
// Doc: https://docs.convex.dev/database/reading-data

import { query } from "../_generated/server";
import { v } from "convex/values";

/**
 * Get all push tokens for a user.
 */
export const getUserPushTokens = query({
  args: { userId: v.string() },
  returns: v.array(
    v.object({
      _id: v.id("userPushTokens"),
      _creationTime: v.number(),
      userId: v.string(),
      expoPushToken: v.string(),
      deviceId: v.string(),
      platform: v.string(),
    }),
  ),
  handler: async (ctx, { userId }) => {
    return await ctx.db
      .query("userPushTokens")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();
  },
});

/**
 * Get all notification preferences for a user.
 */
export const getNotificationPreferences = query({
  args: { userId: v.string() },
  returns: v.array(
    v.object({
      _id: v.id("notificationPreferences"),
      _creationTime: v.number(),
      userId: v.string(),
      notificationType: v.string(),
      enabled: v.boolean(),
    }),
  ),
  handler: async (ctx, { userId }) => {
    return await ctx.db
      .query("notificationPreferences")
      .withIndex("by_userId_type", (q) => q.eq("userId", userId))
      .collect();
  },
});
