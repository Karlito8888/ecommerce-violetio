/**
 * API Route: GET /api/collections/:collectionId/products
 *
 * Returns paginated products for a specific collection from Violet API.
 * Public endpoint — no authentication required.
 *
 * Query params: page (default 1), pageSize (default 12)
 *
 * @see audit-dual-backend.md — Phase 2 migration endpoint
 */
import { createFileRoute } from "@tanstack/react-router";
import { getAdapter } from "#/server/violetAdapter";
import { getCountryCookieFn } from "#/server/geoip";

export const Route = createFileRoute("/api/collections/$collectionId/products")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const url = new URL(request.url);
        const page = Number(url.searchParams.get("page") ?? 1);
        const pageSize = Number(url.searchParams.get("pageSize") ?? 12);

        const { countryCode } = await getCountryCookieFn();
        const adapter = getAdapter();

        const result = await adapter.getCollectionOffers(
          params.collectionId,
          page,
          pageSize,
          countryCode ?? undefined,
        );

        return Response.json({ data: result.data, error: result.error });
      },
    },
  },
});
