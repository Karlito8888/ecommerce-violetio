/**
 * API Route: GET /api/collections
 *
 * Returns all active collections from Violet API.
 * Public endpoint — no authentication required.
 *
 * @see https://docs.violet.io/api-reference/catalog/collections
 */
import { createFileRoute } from "@tanstack/react-router";
import { getAdapter } from "#/server/violetAdapter";

export const Route = createFileRoute("/api/collections/")({
  server: {
    handlers: {
      GET: async () => {
        const adapter = getAdapter();
        const result = await adapter.getCollections();
        return Response.json({ data: result.data, error: result.error });
      },
    },
  },
});
