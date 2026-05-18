// convex/lib/push.ts
//
// Convex action for sending push notifications via Expo Push API.
// Replaces Supabase Edge Function: send-push.
//
// Doc: https://docs.convex.dev/functions/actions

import { action } from "../_generated/server";
import { v } from "convex/values";

interface PushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: string;
}

/**
 * Send a push notification via Expo Push API.
 */
export const sendPushNotification = action({
  args: {
    expoPushToken: v.string(),
    title: v.string(),
    body: v.string(),
    data: v.optional(v.any()),
  },
  handler: async (_ctx, { expoPushToken, title, body, data }) => {
    const message: PushMessage = {
      to: expoPushToken,
      title,
      body,
      sound: "default",
      data,
    };

    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(message),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Push notification failed (${response.status}): ${text}`);
    }

    const result = (await response.json()) as { data?: { status?: string; id?: string } };
    return result.data;
  },
});
