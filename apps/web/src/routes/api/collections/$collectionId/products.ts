/**
 * API Route: GET /api/collections/:collectionId/products
 *
 * Returns paginated products for a specific collection from Violet API.
 * Public endpoint — no authentication required.
 *
 * Query params: page (default 1), pageSize (default 12)
 *
 * Delegates to the shared getCollectionProductsFn server function to ensure
 * contextual pricing is applied consistently.
 *
 * @see audit-dual-backend.md — Phase 2 migration endpoint
 */
import { createFileRoute } from "@tanstack/react-router";
import { getCollectionProductsFn } from "#/server/getCollections";

export const Route = createFileRoute("/api/collections/$collectionId/products")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const url = new URL(request.url);
        const page = Number(url.searchParams.get("page") ?? 1);
        const pageSize = Number(url.searchParams.get("pageSize") ?? 12);

        const result = await getCollectionProductsFn({
          data: { collectionId: params.collectionId, page, pageSize },
        });
        return Response.json(result);
      },
    },
  },
});
