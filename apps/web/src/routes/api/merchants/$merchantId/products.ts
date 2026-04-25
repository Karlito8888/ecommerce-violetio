/**
 * API Route: GET /api/merchants/:merchantId/products
 *
 * Returns paginated products for a specific merchant from Violet API.
 * Public endpoint — no authentication required.
 *
 * Query params: page (default 1), pageSize (default 12)
 *
 * Delegates to the shared getMerchantProductsFn server function to ensure
 * contextual pricing (country/cookie) is applied consistently for mobile.
 *
 * @see audit-dual-backend.md — Phase 2 migration endpoint
 */
import { createFileRoute } from "@tanstack/react-router";
import { getMerchantProductsFn } from "#/server/getMerchant";

export const Route = createFileRoute("/api/merchants/$merchantId/products")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const url = new URL(request.url);
        const page = Number(url.searchParams.get("page") ?? 1);
        const pageSize = Number(url.searchParams.get("pageSize") ?? 12);

        const result = await getMerchantProductsFn({
          data: { merchantId: params.merchantId, page, pageSize },
        });
        return Response.json(result);
      },
    },
  },
});
