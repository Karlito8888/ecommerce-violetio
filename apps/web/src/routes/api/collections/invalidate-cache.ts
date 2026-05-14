/**
 * API Route: POST /api/collections/invalidate-cache
 *
 * Invalidates the in-memory collections cache on the web backend.
 * Called by Supabase Edge Functions when a collection webhook event is received
 * (COLLECTION_CREATED, COLLECTION_UPDATED, COLLECTION_REMOVED, COLLECTION_OFFERS_UPDATED).
 *
 * Secured with a shared secret via the `X-Webhook-Secret` header.
 *
 * @see supabase/functions/handle-webhook/processors.ts — collection webhook processors
 */
import { createFileRoute } from "@tanstack/react-router";
import { getAdapter } from "#/server/violetAdapter";

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET ?? "";

export const Route = createFileRoute("/api/collections/invalidate-cache")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Verify shared secret
        const secret = request.headers.get("X-Webhook-Secret");
        if (!WEBHOOK_SECRET || secret !== WEBHOOK_SECRET) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        getAdapter().invalidateCollectionsCache();

        return Response.json({ ok: true });
      },
    },
  },
});
