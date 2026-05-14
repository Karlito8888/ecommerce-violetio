/**
 * Invalidates the collections cache on the web backend.
 *
 * Called from Deno Edge Functions when a collection webhook event is received.
 * The web backend adapter has an in-memory cache that needs to be cleared
 * so the next request fetches fresh data from Violet.
 *
 * Fire-and-forget: failures are logged but don't block webhook processing.
 * The cache has a 2-minute TTL anyway, so a missed invalidation self-heals.
 *
 * @see apps/web/src/routes/api/collections/invalidate-cache.ts — the endpoint
 */
import { WEB_BACKEND_URL } from "./constants.ts";

/**
 * Shared secret for internal API calls between Edge Functions and web backend.
 * Must match WEBHOOK_SECRET in the web backend's environment.
 */
const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET") ?? "";

export async function invalidateCollectionsCache(): Promise<void> {
  try {
    const response = await fetch(`${WEB_BACKEND_URL}/api/collections/invalidate-cache`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Secret": WEBHOOK_SECRET,
      },
    });

    if (!response.ok) {
      console.error(
        `[cache-invalidation] Failed to invalidate collections cache: ${response.status} ${response.statusText}`,
      );
    }
  } catch (err) {
    console.error(
      `[cache-invalidation] Error calling invalidate-cache endpoint: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
