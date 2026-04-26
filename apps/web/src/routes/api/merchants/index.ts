/**
 * API Route: GET /api/merchants
 *
 * Returns all connected merchants from Violet API.
 * Public endpoint — no authentication required.
 *
 * Query params:
 *   - with_counts=true — enrich each merchant with offer_count
 *
 * @see audit-dual-backend.md — Phase 2 migration endpoint
 */
import { createFileRoute } from "@tanstack/react-router";
import { getMerchantsFn, getMerchantsWithCountsFn } from "#/server/getMerchants";

export const Route = createFileRoute("/api/merchants/")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const withCounts = url.searchParams.get("with_counts") === "true";

        const data = withCounts ? await getMerchantsWithCountsFn() : await getMerchantsFn();

        return Response.json({ data, error: null });
      },
    },
  },
});
