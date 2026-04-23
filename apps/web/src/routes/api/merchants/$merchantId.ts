/**
 * API Route: GET /api/merchants/:merchantId
 *
 * Returns details for a single merchant from Violet API.
 * Public endpoint — no authentication required.
 *
 * @see audit-dual-backend.md — Phase 2 migration endpoint
 */
import { createFileRoute } from "@tanstack/react-router";
import { getAdapter } from "#/server/violetAdapter";

export const Route = createFileRoute("/api/merchants/$merchantId")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const result = await getAdapter().getMerchant(params.merchantId);
        return Response.json({ data: result.data, error: result.error });
      },
    },
  },
});
