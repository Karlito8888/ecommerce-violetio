/**
 * API Route: POST /api/cart/:cartId/skus
 *
 * Adds a SKU to the cart.
 *
 * Body: { skuId: number, quantity: number }
 *
 * @see audit-dual-backend.md — Phase 2 migration endpoint (cart subset)
 * @see apps/web/src/server/cartActions.ts — addToCartFn
 */
import { createFileRoute } from "@tanstack/react-router";
import { getAdapter } from "#/server/violetAdapter";
import type { CartItemInput } from "@ecommerce/shared";

export const Route = createFileRoute("/api/cart/$cartId/skus/")({
  server: {
    handlers: {
      POST: async ({ params, request }) => {
        const body = (await request.json()) as CartItemInput;
        const adapter = getAdapter();

        const result = await adapter.addToCart(params.cartId, {
          skuId: body.skuId,
          quantity: body.quantity,
        });

        return Response.json({ data: result.data, error: result.error });
      },
    },
  },
});
