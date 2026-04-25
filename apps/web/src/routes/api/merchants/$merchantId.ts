/**
 * API Route: GET /api/merchants/:merchantId
 *
 * Returns details for a single merchant from Violet API.
 * Public endpoint — no authentication required.
 *
 * Delegates to the shared getMerchantFn server function to avoid
 * duplicating adapter calls and error handling.
 *
 * @see audit-dual-backend.md — Phase 2 migration endpoint
 */
import { createFileRoute } from "@tanstack/react-router";
import { getMerchantFn } from "#/server/getMerchant";

export const Route = createFileRoute("/api/merchants/$merchantId")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const result = await getMerchantFn({ data: params.merchantId });
        return Response.json(result);
      },
    },
  },
});
