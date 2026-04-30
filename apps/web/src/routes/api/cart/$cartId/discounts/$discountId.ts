/**
 * API Route: DELETE /api/cart/:cartId/discounts/:discountId
 *
 * Removes a discount/promo code from the cart.
 * Mobile proxy — delegates to VioletAdapter.
 *
 * Returns the full cart without the removed discount.
 *
 * @see https://docs.violet.io/prism/checkout-guides/discounts/applying-discounts
 */
import { createFileRoute } from "@tanstack/react-router";
import { getAdapter } from "#/server/violetAdapter";

export const Route = createFileRoute("/api/cart/$cartId/discounts/$discountId")({
  server: {
    handlers: {
      DELETE: async ({ params }) => {
        const { cartId, discountId } = params;

        if (!discountId || discountId.length === 0) {
          return Response.json({
            data: null,
            error: { code: "VALIDATION", message: "Discount ID is required" },
          });
        }

        const adapter = getAdapter();
        const result = await adapter.removeDiscount(cartId, discountId);
        return Response.json({ data: result.data, error: result.error });
      },
    },
  },
});
