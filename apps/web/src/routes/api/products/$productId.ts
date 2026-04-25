/**
 * API Route: GET /api/products/:productId
 *
 * Returns a single product's details from Violet API.
 * Public endpoint — no authentication required.
 *
 * Delegates to the shared getProductFn server function to ensure consistent
 * contextual pricing.
 *
 * @see audit-dual-backend.md — Phase 2 migration endpoint
 */
import { createFileRoute } from "@tanstack/react-router";
import { getProductFn } from "#/server/getProduct";

export const Route = createFileRoute("/api/products/$productId")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const result = await getProductFn({ data: params.productId });
        return Response.json(result);
      },
    },
  },
});
