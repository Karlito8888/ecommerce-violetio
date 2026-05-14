/**
 * API Route: GET /api/collections/:collectionId
 *
 * Returns a single collection by ID from Violet API.
 * Uses GET /catalog/collections/{id} directly — avoids fetching all collections.
 * Public endpoint — no authentication required.
 *
 * @see https://docs.violet.io/api-reference/catalog/collections/get-collection-by-id
 */
import { createFileRoute } from "@tanstack/react-router";
import { getAdapter } from "#/server/violetAdapter";

export const Route = createFileRoute("/api/collections/$collectionId/")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const result = await getAdapter().getCollectionById(params.collectionId);
        if (!result.data) {
          return Response.json(
            {
              data: null,
              error: { code: "NOT_FOUND", message: `Collection ${params.collectionId} not found` },
            },
            { status: 404 },
          );
        }
        return Response.json(result);
      },
    },
  },
});
