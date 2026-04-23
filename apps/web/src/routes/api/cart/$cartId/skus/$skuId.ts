/**
 * API Route: PUT|DELETE /api/cart/:cartId/skus/:skuId
 *
 * PUT: Update SKU quantity.
 *   Body: { quantity: number } — skuId comes from URL param
 * DELETE: Remove SKU from cart.
 *   No body needed — skuId comes from URL param
 *
 * The skuId param is the order_sku_id (the Violet-generated ID for the
 * cart line item, NOT the catalog sku_id). This matches the mobile's
 * current usage where skuId is extracted from cart item's `skuId` field.
 *
 * @see audit-dual-backend.md — Phase 2+3 migration endpoint
 * @see apps/web/src/server/cartActions.ts — updateCartItemFn, removeFromCartFn
 */
import { createFileRoute } from "@tanstack/react-router";
import { getAdapter } from "#/server/violetAdapter";

export const Route = createFileRoute("/api/cart/$cartId/skus/$skuId")({
  server: {
    handlers: {
      PUT: async ({ params, request }) => {
        const body = (await request.json()) as { quantity?: number };
        const adapter = getAdapter();
        const result = await adapter.updateCartItem(
          params.cartId,
          params.skuId,
          body.quantity ?? 1,
        );
        return Response.json({ data: result.data, error: result.error });
      },
      DELETE: async ({ params }) => {
        const adapter = getAdapter();
        const result = await adapter.removeFromCart(params.cartId, params.skuId);
        return Response.json({ data: result.data, error: result.error });
      },
    },
  },
});
