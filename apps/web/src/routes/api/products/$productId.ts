/**
 * API Route: GET /api/products/:productId
 *
 * Returns a single product's details from Violet API.
 * Public endpoint — no authentication required.
 *
 * @see audit-dual-backend.md — Phase 2 migration endpoint
 */
import { createFileRoute } from "@tanstack/react-router";
import { getAdapter } from "#/server/violetAdapter";
import { getCountryCookieFn } from "#/server/geoip";

export const Route = createFileRoute("/api/products/$productId")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { countryCode } = await getCountryCookieFn();
        const adapter = getAdapter();
        const result = await adapter.getProduct(params.productId, countryCode ?? undefined);
        return Response.json({ data: result.data, error: result.error });
      },
    },
  },
});
