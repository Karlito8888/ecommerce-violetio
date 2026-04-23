/**
 * API Route: GET /api/cart/:cartId/shipping/available
 *
 * Fetches available shipping methods for all merchant bags in the cart.
 * Requires Supabase auth (JWT in Authorization header).
 *
 * @see audit-dual-backend.md — Phase 3 checkout migration
 * @see apps/web/src/server/checkout.ts — getAvailableShippingMethodsFn
 */
import { createFileRoute } from "@tanstack/react-router";
import { getAdapter } from "#/server/violetAdapter";

export const Route = createFileRoute("/api/cart/$cartId/shipping/available")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const adapter = getAdapter();
        const result = await adapter.getAvailableShippingMethods(params.cartId);
        return Response.json({ data: result.data, error: result.error });
      },
    },
  },
});
