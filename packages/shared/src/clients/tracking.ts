import type { SupabaseClient } from "@supabase/supabase-js";
/** M6 review fix: Added .js extensions for ESM consistency. */
import { createSupabaseClient } from "./supabase.js";
import type { TrackingEvent, TrackingEventType, UserEvent } from "../types/tracking.types.js";

/**
 * Records a tracking event. Must be called with a service_role client
 * (from Server Function or Edge Function), NOT the browser client.
 * Failures are logged but never thrown — tracking must not break UX.
 */
export async function recordEvent(
  userId: string,
  event: TrackingEvent,
  client: SupabaseClient,
): Promise<void> {
  const { error } = await client.from("user_events").insert({
    user_id: userId,
    event_type: event.event_type,
    payload: event.payload,
  });

  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[tracking] Failed to record event:", error.message);
  }
}

interface GetEventsOptions {
  eventType?: TrackingEventType;
  limit?: number;
  /** ISO date string — only return events after this date */
  since?: string;
}

/**
 * Reads user's own browsing events. Uses the browser client (RLS-protected:
 * users can only SELECT their own rows).
 */
export async function getUserEvents(
  userId: string,
  options?: GetEventsOptions,
  client?: SupabaseClient,
): Promise<UserEvent[]> {
  const supabase = client ?? createSupabaseClient();
  let query = supabase
    .from("user_events")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (options?.eventType) {
    query = query.eq("event_type", options.eventType);
  }
  if (options?.since) {
    query = query.gte("created_at", options.since);
  }
  if (options?.limit) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as UserEvent[];
}
