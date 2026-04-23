/**
 * API Route: GET /api/cart/:cartId
 *
 * Fetches the current state of a Violet cart.
 *
 * @see audit-dual-backend.md — Phase 2 migration endpoint (cart subset)
 * @see apps/web/src/server/cartActions.ts — getCartFn
 */
import { createFileRoute } from "@tanstack/react-router";
import { getAdapter } from "#/server/violetAdapter";

export const Route = createFileRoute("/api/cart/$cartId/")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const adapter = getAdapter();
        const result = await adapter.getCart(params.cartId);
        return Response.json({ data: result.data, error: result.error });
      },
    },
  },
});
