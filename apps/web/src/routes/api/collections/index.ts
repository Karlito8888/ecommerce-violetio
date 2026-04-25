/**
 * API Route: GET /api/collections
 *
 * Returns all active collections from Violet API.
 * Public endpoint — no authentication required.
 *
 * Delegates to the shared getCollectionsFn server function to avoid
 * duplicating adapter calls and error handling.
 *
 * @see https://docs.violet.io/api-reference/catalog/collections
 */
import { createFileRoute } from "@tanstack/react-router";
import { getCollectionsFn } from "#/server/getCollections";

export const Route = createFileRoute("/api/collections/")({
  server: {
    handlers: {
      GET: async () => {
        const result = await getCollectionsFn();
        return Response.json(result);
      },
    },
  },
});
