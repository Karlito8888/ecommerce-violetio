/**
 * Tracking Server Function — records browsing events for authenticated users.
 *
 * ## Security (H1 code-review fix)
 * The `userId` is **never** accepted from the client. The handler extracts the
 * authenticated user from the session cookie via `getSupabaseSessionClient()`.
 * This prevents IDOR attacks where a malicious client could pollute another
 * user's browsing history by sending a forged userId.
 *
 * ## Client bundle safety
 * Handler logic lives in trackingHandlers.ts and is loaded via dynamic import
 * INSIDE the .handler() closure. TanStack Start removes the .handler() body
 * from the client bundle, keeping supabaseServer.ts server-only.
 *
 * @module server/tracking
 */

import { createServerFn } from "@tanstack/react-start";
import type { TrackingEvent } from "@ecommerce/shared";

export const trackEventFn = createServerFn({ method: "POST" })
  .inputValidator((data: { event: TrackingEvent }) => data)
  .handler(async ({ data }) => {
    const { trackEventHandler } = await import("./trackingHandlers");
    await trackEventHandler(data.event);
    return { ok: true };
  });
