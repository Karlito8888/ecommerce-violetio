// convex/notifications/mutations.ts
//
// Convex mutations for push tokens and notification preferences.
// Replaces packages/shared/src/clients/notifications.ts (Supabase write functions).
//
// Patterns:
//   - upsertPushToken: first() → patch or insert (replaces Supabase ON CONFLICT)
//   - upsertNotificationPreference: same upsert pattern via compound index
//
// Doc: https://docs.convex.dev/database/writing-data

import { mutation } from "../_generated/server";
import { v } from "convex/values";

/**
 * Register or update a push token for a user.
 * If the token already exists (same expoPushToken), updates the deviceId.
 * If the user already has a token for this device, updates the expoPushToken.
 */
export const upsertPushToken = mutation({
  args: {
    userId: v.string(),
    expoPushToken: v.string(),
    deviceId: v.string(),
    platform: v.string(), // "ios" | "android"
  },
  returns: v.null(),
  handler: async (ctx, { userId, expoPushToken, deviceId, platform }) => {
    // Check if this token already exists (same expoPushToken)
    const existingByToken = await ctx.db
      .query("userPushTokens")
      .withIndex("by_expoPushToken", (q) => q.eq("expoPushToken", expoPushToken))
      .first();

    if (existingByToken) {
      // Update the existing token entry
      await ctx.db.patch("userPushTokens", existingByToken._id, { userId, deviceId, platform });
      return;
    }

    // New token — insert
    await ctx.db.insert("userPushTokens", {
      userId,
      expoPushToken,
      deviceId,
      platform,
    });
  },
});

/**
 * Delete a push token (e.g. on logout or token invalidation).
 */
export const deletePushToken = mutation({
  args: { expoPushToken: v.string() },
  returns: v.null(),
  handler: async (ctx, { expoPushToken }) => {
    const existing = await ctx.db
      .query("userPushTokens")
      .withIndex("by_expoPushToken", (q) => q.eq("expoPushToken", expoPushToken))
      .first();

    if (existing) {
      await ctx.db.delete("userPushTokens", existing._id);
    }
  },
});

/**
 * Upsert a notification preference for a user.
 * Uses the compound index by_userId_type for lookup.
 */
export const upsertNotificationPreference = mutation({
  args: {
    userId: v.string(),
    notificationType: v.string(),
    enabled: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, { userId, notificationType, enabled }) => {
    const existing = await ctx.db
      .query("notificationPreferences")
      .withIndex("by_userId_type", (q) =>
        q.eq("userId", userId).eq("notificationType", notificationType),
      )
      .first();

    if (existing) {
      await ctx.db.patch("notificationPreferences", existing._id, { enabled });
    } else {
      await ctx.db.insert("notificationPreferences", {
        userId,
        notificationType,
        enabled,
      });
    }
  },
});
