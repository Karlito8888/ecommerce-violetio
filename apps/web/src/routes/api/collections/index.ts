/**
 * API Route: GET /api/collections
 *
 * Returns all active collections directly from Violet API.
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
        const result = await getAdapter().getCollections();
        return Response.json(result);
      },
    },
  },
});
