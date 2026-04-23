/**
 * API Route: GET /api/cart/:cartId/price
 *
 * Forces cart pricing via GET /checkout/cart/{id}/price.
 * Called when setShippingMethods returns tax_total === 0.
 * Requires Supabase auth (JWT in Authorization header).
 *
 * @see audit-dual-backend.md — Phase 3 checkout migration
 * @see apps/web/src/server/checkout.ts — priceCartFn
 */
import { createFileRoute } from "@tanstack/react-router";
import { getAdapter } from "#/server/violetAdapter";

export const Route = createFileRoute("/api/cart/$cartId/price")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const adapter = getAdapter();
        const result = await adapter.priceCart(params.cartId);
        return Response.json({ data: result.data, error: result.error });
      },
    },
  },
});
