/**
 * Edge Function: send-push
 *
 * Sends push notifications via the Expo Push API to registered mobile devices.
 * Invoked fire-and-forget from webhook processors and checkout flow.
 *
 * ## Delivery pipeline
 * 1. Validate payload (user_id, type, title, body)
 * 2. Check user preferences — skip if opted out
 * 3. Anti-spam check for engagement notifications (max 1/day)
 * 4. Fetch all push tokens for the user
 * 5. Send batch to Expo Push API
 * 6. Handle errors: DeviceNotRegistered → delete invalid token
 * 7. Log to notification_logs table
 *
 * ## Error handling
 * - Always returns HTTP 200 (callers use fire-and-forget)
 * - Missing tokens → graceful skip (user hasn't registered for push)
 * - User opted out → graceful skip
 * - Expo API errors → logged but never propagated
 *
 * @see https://docs.expo.dev/push-notifications/sending-notifications/
 */

import { corsHeaders } from "../_shared/cors.ts";
import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import type { SendPushRequest, ExpoPushMessage, ExpoPushTicket } from "./types.ts";
import { PUSH_TYPE_TO_PREFERENCE, ENGAGEMENT_TYPES } from "./types.ts";

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

const VALID_TYPES = [
  "order_confirmed",
  "order_shipped",
  "order_delivered",
  "refund_processed",
  "price_drop",
  "back_in_stock",
] as const;

function successResponse(data: Record<string, unknown>): Response {
  return new Response(JSON.stringify({ data, error: null }), {
    status: 200,
    headers: jsonHeaders,
  });
}

function errorResponse(message: string): Response {
  return new Response(JSON.stringify({ data: null, error: { message } }), {
    status: 200, // Always 200 — callers use fire-and-forget
    headers: jsonHeaders,
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  let payload: SendPushRequest;
  try {
    payload = await req.json();
  } catch {
    return errorResponse("Invalid JSON body");
  }

  // Validate payload
  if (!payload.user_id) return errorResponse("Missing user_id");
  if (!payload.type || !VALID_TYPES.includes(payload.type)) {
    return errorResponse(`Invalid push type: ${payload.type}`);
  }
  if (!payload.title || !payload.body) {
    return errorResponse("Missing title or body");
  }

  const supabase = getSupabaseAdmin();
  const logType = `push_${payload.type}`;

  // Check user notification preferences
  const preferenceCategory = PUSH_TYPE_TO_PREFERENCE[payload.type];
  const { data: prefRows } = await supabase
    .from("notification_preferences")
    .select("enabled")
    .eq("user_id", payload.user_id)
    .eq("notification_type", preferenceCategory)
    .limit(1);

  // If no row exists, use defaults (transactional: true, marketing: false)
  if (prefRows && prefRows.length > 0 && !prefRows[0].enabled) {
    return successResponse({ sent: false, reason: "User opted out" });
  }
  // No row + marketing → default off
  if ((!prefRows || prefRows.length === 0) && preferenceCategory === "marketing") {
    return successResponse({ sent: false, reason: "Marketing default off" });
  }

  // Anti-spam: max 1 engagement notification per user per day
  if (ENGAGEMENT_TYPES.includes(payload.type)) {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count } = await supabase
      .from("notification_logs")
      .select("*", { count: "exact", head: true })
      .eq("recipient_email", payload.user_id)
      .in("notification_type", ["push_price_drop", "push_back_in_stock"])
      .eq("status", "sent")
      .gte("created_at", oneDayAgo);

    if (count && count >= 1) {
      return successResponse({ sent: false, reason: "Anti-spam: engagement limit reached" });
    }
  }

  // Fetch all push tokens for the user
  const { data: tokens, error: tokenError } = await supabase
    .from("user_push_tokens")
    .select("expo_push_token")
    .eq("user_id", payload.user_id);

  if (tokenError) {
    console.error(`[send-push] Token fetch error: ${tokenError.message}`);
    return errorResponse(`Token fetch failed: ${tokenError.message}`);
  }

  if (!tokens || tokens.length === 0) {
    return successResponse({ sent: false, reason: "No push tokens registered" });
  }

  // Build Expo Push API messages
  const messages: ExpoPushMessage[] = tokens.map((t) => ({
    to: t.expo_push_token,
    title: payload.title,
    body: payload.body,
    data: payload.data ?? {},
    sound: "default" as const,
    channelId: "default",
  }));

  // Send to Expo Push API
  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
      },
      body: JSON.stringify(messages),
    });

    if (!res.ok) {
      const errorBody = await res.text();
      console.error(`[send-push] Expo API error ${res.status}: ${errorBody}`);
      await logNotification(
        supabase,
        payload.user_id,
        logType,
        "failed",
        `Expo API: ${res.status}`,
      );
      return successResponse({ sent: false, error: `Expo API: ${res.status}` });
    }

    const result = await res.json();
    const tickets: ExpoPushTicket[] = result.data ?? [];

    // Process tickets — clean up invalid tokens
    let sentCount = 0;
    for (let i = 0; i < tickets.length; i++) {
      const ticket = tickets[i];
      if (ticket.status === "ok") {
        sentCount++;
      } else if (ticket.details?.error === "DeviceNotRegistered") {
        // Token is invalid — remove from database
        const invalidToken = tokens[i].expo_push_token;
        await supabase.from("user_push_tokens").delete().eq("expo_push_token", invalidToken);
        console.warn(`[send-push] Removed invalid token: ${invalidToken.slice(0, 20)}...`);
      } else {
        console.warn(`[send-push] Ticket error: ${ticket.message ?? "unknown"}`);
      }
    }

    await logNotification(
      supabase,
      payload.user_id,
      logType,
      sentCount > 0 ? "sent" : "failed",
      sentCount > 0 ? null : "All tokens failed",
    );

    return successResponse({
      sent: sentCount > 0,
      sent_count: sentCount,
      total_tokens: tokens.length,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown fetch error";
    console.error(`[send-push] Network error: ${msg}`);
    await logNotification(supabase, payload.user_id, logType, "failed", `Network: ${msg}`);
    return successResponse({ sent: false, error: msg });
  }
});

/**
 * Logs a push notification attempt to the notification_logs table.
 * Reuses the existing table — push types are prefixed with "push_".
 *
 * NOTE: Stores user_id in the `recipient_email` column (not an actual email).
 * This avoids an extra migration to add a user_id column to notification_logs.
 * The anti-spam index (idx_notification_logs_push_antispam) relies on this.
 * If a dedicated user_id column is added later, update both this function
 * and the anti-spam query above.
 */
async function logNotification(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  userId: string,
  notificationType: string,
  status: string,
  errorMessage: string | null,
): Promise<void> {
  const { error } = await supabase.from("notification_logs").insert({
    order_id: null,
    notification_type: notificationType,
    recipient_email: userId,
    status,
    error_message: errorMessage,
    attempt: 1,
  });
  if (error) {
    console.error(`[send-push] Failed to log notification: ${error.message}`);
  }
}
