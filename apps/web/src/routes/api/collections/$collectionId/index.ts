/**
 * API Route: GET /api/collections/:collectionId
 *
 * Returns a single collection by ID from Violet API.
 * Public endpoint — no authentication required.
 *
 * @see https://docs.violet.io/api-reference/catalog/collections
 */
import { createFileRoute } from "@tanstack/react-router";
import { getAdapter } from "#/server/violetAdapter";

export const Route = createFileRoute("/api/collections/$collectionId/")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const adapter = getAdapter();
        const result = await adapter.getCollections();
        const collection = (result.data ?? []).find((c) => c.id === params.collectionId);

        if (!collection) {
          return Response.json(
            {
              data: null,
              error: { code: "NOT_FOUND", message: `Collection ${params.collectionId} not found` },
            },
            { status: 404 },
          );
        }

        return Response.json({ data: collection, error: null });
      },
    },
  },
});
