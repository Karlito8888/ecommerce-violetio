/**
 * API Route: GET /api/collections/:collectionId
 *
 * Returns a single collection by ID from Violet API.
 * Public endpoint — no authentication required.
 *
 * Delegates to the shared getCollectionByIdFn server function which does
 * a targeted Supabase query instead of loading all collections.
 *
 * @see https://docs.violet.io/api-reference/catalog/collections
 */
import { createFileRoute } from "@tanstack/react-router";
import { getCollectionByIdFn } from "#/server/getCollections";

export const Route = createFileRoute("/api/collections/$collectionId/")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const result = await getCollectionByIdFn({ data: params.collectionId });
        if (result.error) {
          return Response.json(result, { status: 404 });
        }
        return Response.json(result);
      },
    },
  },
});
