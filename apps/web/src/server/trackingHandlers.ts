import { getSupabaseServer, getSupabaseSessionClient } from "./supabaseServer";
import { recordEvent } from "@ecommerce/shared";
import type { TrackingEvent } from "@ecommerce/shared";

/**
 * Handler for recording a user tracking event.
 *
 * ## Security (H1 code-review fix)
 * The user identity is extracted from the session cookie server-side via
 * `getSupabaseSessionClient()` — the client never supplies a userId.
 * This prevents Insecure Direct Object Reference (IDOR) attacks where a
 * malicious client could call the Server Function with another user's ID
 * and pollute their browsing history.
 *
 * The Edge Function (`supabase/functions/track-event`) uses the same pattern:
 * it validates the JWT from the Authorization header to extract user.id.
 *
 * ## Write path
 * After verifying identity, the event is written via the service_role client
 * (`getSupabaseServer()`), which bypasses RLS. The `user_events` table only
 * allows INSERT for service_role — authenticated users can only SELECT.
 */
export async function trackEventHandler(event: TrackingEvent): Promise<void> {
  const sessionClient = getSupabaseSessionClient();
  const {
    data: { user },
    error: authError,
  } = await sessionClient.auth.getUser();

  if (authError || !user || user.is_anonymous) {
    // Silently skip — anonymous/unauthenticated users are not tracked (AC #8).
    // Tracking failures must never leak auth state to the client.
    return;
  }

  const serviceClient = getSupabaseServer();
  await recordEvent(user.id, event, serviceClient);
}
