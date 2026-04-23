/**
 * API Route: POST /api/track-event
 *
 * Records a user tracking event. Requires Supabase auth (JWT in Authorization header).
 * Uses the same business logic as the web's trackingHandlers.
 *
 * Body: TrackingEvent (from @ecommerce/shared)
 *
 * @see audit-dual-backend.md — Phase 2 migration endpoint
 */
import { createFileRoute } from "@tanstack/react-router";
import type { TrackingEvent } from "@ecommerce/shared";

export const Route = createFileRoute("/api/track-event")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const event = (await request.json()) as TrackingEvent;
        const { trackEventHandler } = await import("../../server/trackingHandlers");
        await trackEventHandler(event);
        return Response.json({ success: true });
      },
    },
  },
});
