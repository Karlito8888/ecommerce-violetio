/**
 * API Route: GET /api/merchants/:merchantId/products
 *
 * Returns paginated products for a specific merchant from Violet API.
 * Public endpoint — no authentication required.
 *
 * Query params: page (default 1), pageSize (default 12)
 *
 * @see audit-dual-backend.md — Phase 2 migration endpoint
 */
import { createFileRoute } from "@tanstack/react-router";
import { getAdapter } from "#/server/violetAdapter";

export const Route = createFileRoute("/api/merchants/$merchantId/products")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const url = new URL(request.url);
        const page = Number(url.searchParams.get("page") ?? 1);
        const pageSize = Number(url.searchParams.get("pageSize") ?? 12);

        const result = await getAdapter().getMerchantProducts(params.merchantId, {
          page,
          pageSize,
        });

        return Response.json({ data: result.data, error: result.error });
      },
    },
  },
});
