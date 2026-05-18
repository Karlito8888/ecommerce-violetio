// convex/lib/push.ts
//
// Centralized push notification utilities for Convex.
// Provides:
//   - sendPushNotification: public action for single-token push
//   - sendPushBatch: plain async function for batch sends from internal actions
//   - handlePushTickets: processes Expo API response (cleans up invalid tokens)
//
// DRY: All Expo Push API calls go through this module.
// Convex internal actions call sendPushBatch() directly (no ctx.runAction overhead).
//
// Doc: https://docs.convex.dev/functions/actions
// Doc: https://docs.expo.dev/push-notifications/sending-notifications/

import { action, internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { FunctionReference, OptionalRestArgs, FunctionReturnType } from "convex/server";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_BATCH_LIMIT = 100;

// ─── Types ───────────────────────────────────────────────────────────

export interface PushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: string;
}

interface ExpoPushTicket {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: { error?: string };
}

/** Maps push notification types to user preference categories. */
const PUSH_TYPE_TO_PREFERENCE: Record<string, string> = {
  order_confirmed: "order_updates",
  bag_shipped: "order_updates",
  bag_delivered: "order_updates",
  refund_processed: "order_updates",
  order_shipped: "order_updates",
  order_delivered: "order_updates",
  price_drop: "price_drops",
  back_in_stock: "back_in_stock",
};

/** Engagement types subject to anti-spam daily limit (max 1/day). */
const ENGAGEMENT_TYPES = ["price_drop", "back_in_stock"];

// ─── Internal Mutation — Cleanup Invalid Token ────────────────────────

/**
 * Deletes a push token that Expo reports as invalid (DeviceNotRegistered).
 * Called by handlePushTickets when the Expo API returns an error for a token.
 */
export const deleteInvalidToken = internalMutation({
  args: { expoPushToken: v.string() },
  handler: async (ctx, { expoPushToken }) => {
    const existing = await ctx.db
      .query("userPushTokens")
      .withIndex("by_expoPushToken", (q) => q.eq("expoPushToken", expoPushToken))
      .first();

    if (existing) {
      await ctx.db.delete("userPushTokens", existing._id);
      console.warn(`[push] Removed invalid token: ${expoPushToken.slice(0, 20)}...`);
    }
  },
});

// ─── Batch Push (plain async function — callable from actions) ───────

/**
 * Sends push notifications to multiple tokens via Expo Push API.
 * Handles batching (max 100 per request), error responses, and token cleanup.
 *
 * This is a plain async function (not a Convex function) — callable from
 * any Convex action without ctx.runAction() overhead.
 *
 * Per Convex best practice: "Use helper functions to write shared code"
 * Doc: https://docs.convex.dev/understanding/best-practices
 *
 * @param ctx     - Convex action context (for scheduling token cleanup mutations)
 * @param messages - Array of push messages to send
 * @returns Number of successfully sent messages
 */
export async function sendPushBatch(
  ctx: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    runMutation: <Mutation extends FunctionReference<"mutation", any>>(
      mutation: Mutation,
      ...args: OptionalRestArgs<Mutation>
    ) => Promise<FunctionReturnType<Mutation>>;
  },
  messages: PushMessage[],
): Promise<{ sent: number; failed: number }> {
  if (messages.length === 0) return { sent: 0, failed: 0 };

  let totalSent = 0;
  let totalFailed = 0;

  // Process in batches of EXPO_BATCH_LIMIT
  for (let i = 0; i < messages.length; i += EXPO_BATCH_LIMIT) {
    const batch = messages.slice(i, i + EXPO_BATCH_LIMIT);

    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "Accept-Encoding": "gzip, deflate",
        },
        body: JSON.stringify(batch),
      });

      if (!res.ok) {
        const errorBody = await res.text().catch(() => "");
        console.error(`[push] Expo API error ${res.status}: ${errorBody}`);
        totalFailed += batch.length;
        continue;
      }

      const result = (await res.json()) as { data?: ExpoPushTicket[] };
      const tickets = result.data ?? [];

      for (let j = 0; j < tickets.length; j++) {
        const ticket = tickets[j];
        if (ticket.status === "ok") {
          totalSent++;
        } else if (ticket.details?.error === "DeviceNotRegistered") {
          // Token is invalid — schedule cleanup
          const invalidToken = batch[j]?.to;
          if (invalidToken) {
            try {
              await ctx.runMutation(internal.lib.push.deleteInvalidToken, {
                expoPushToken: invalidToken,
              });
            } catch {
              // Non-critical — token cleanup can retry later
            }
          }
          totalFailed++;
        } else {
          console.warn(`[push] Ticket error: ${ticket.message ?? "unknown"}`);
          totalFailed++;
        }
      }
    } catch (err) {
      console.error(`[push] Network error: ${err instanceof Error ? err.message : "Unknown"}`);
      totalFailed += batch.length;
    }
  }

  return { sent: totalSent, failed: totalFailed };
}

// ─── Notification Preference Checking ───────────────────────────────

/**
 * Checks if a user has opted into a notification type.
 * Returns true if the user has opted in (or has no preference row = default).
 *
 * Transactional notifications (order_updates) default to ON.
 * Marketing/engagement notifications default to OFF.
 */
export function isTransactionalType(notificationType: string): boolean {
  const category = PUSH_TYPE_TO_PREFERENCE[notificationType];
  return category === "order_updates" || !category;
}

export function isEngagementType(notificationType: string): boolean {
  return ENGAGEMENT_TYPES.includes(notificationType);
}

export function getPreferenceCategory(notificationType: string): string | undefined {
  return PUSH_TYPE_TO_PREFERENCE[notificationType];
}

// ─── Public Action (single-token push — kept for backward compat) ───

/**
 * Send a single push notification via Expo Push API.
 * Generic action usable from any other action or mutation.
 */
export const sendPushNotification = action({
  args: {
    expoPushToken: v.string(),
    title: v.string(),
    body: v.string(),
    data: v.optional(v.any()),
  },
  handler: async (ctx, { expoPushToken, title, body, data }) => {
    const { sent } = await sendPushBatch(ctx, [
      { to: expoPushToken, title, body, data, sound: "default" },
    ]);
    if (sent === 0) {
      throw new Error("Push notification failed to send");
    }
  },
});
