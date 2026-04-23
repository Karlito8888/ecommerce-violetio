/**
 * API Route: PUT|DELETE /api/cart/:cartId/skus/:skuId
 *
 * PUT: Update SKU quantity. Body: { orderSkuId: string, quantity: number }
 * DELETE: Remove SKU from cart. Body: { orderSkuId: string }
 *
 * @see audit-dual-backend.md — Phase 2 migration endpoint (cart subset)
 * @see apps/web/src/server/cartActions.ts — updateCartItemFn, removeFromCartFn
 */
import { createFileRoute } from "@tanstack/react-router";
import { getAdapter } from "#/server/violetAdapter";

export const Route = createFileRoute("/api/cart/$cartId/skus/$skuId")({
  server: {
    handlers: {
      PUT: async ({ params, request }) => {
        const body = (await request.json()) as { orderSkuId: string; quantity: number };
        const adapter = getAdapter();
        const result = await adapter.updateCartItem(params.cartId, body.orderSkuId, body.quantity);
        return Response.json({ data: result.data, error: result.error });
      },
      DELETE: async ({ params, request }) => {
        const body = (await request.json()) as { orderSkuId: string };
        const adapter = getAdapter();
        const result = await adapter.removeFromCart(params.cartId, body.orderSkuId);
        return Response.json({ data: result.data, error: result.error });
      },
    },
  },
});
