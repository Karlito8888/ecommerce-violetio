/**
 * API Route: GET /api/merchants
 *
 * Returns all connected merchants from Violet API.
 * Public endpoint — no authentication required.
 *
 * Delegates to the shared getMerchantsFn server function to avoid
 * duplicating adapter calls, sorting, and error handling.
 *
 * @see audit-dual-backend.md — Phase 2 migration endpoint
 */
import { createFileRoute } from "@tanstack/react-router";
import { getMerchantsFn } from "#/server/getMerchants";

export const Route = createFileRoute("/api/merchants/")({
  server: {
    handlers: {
      GET: async () => {
        const data = await getMerchantsFn();
        return Response.json({ data, error: null });
      },
    },
  },
});
