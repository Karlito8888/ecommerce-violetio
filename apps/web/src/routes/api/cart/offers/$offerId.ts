/**
 * API Route: GET /api/cart/offers/:offerId
 *
 * Resolves a Violet offer ID to its first available SKU ID.
 * Used by mobile to get the purchasable SKU from a product listing (offer).
 *
 * @see audit-dual-backend.md — Phase 3 cart migration
 */
import { createFileRoute } from "@tanstack/react-router";
import { getAdapter } from "#/server/violetAdapter";

export const Route = createFileRoute("/api/cart/offers/$offerId")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const adapter = getAdapter();
        const result = await adapter.getProduct(params.offerId);

        if (result.error || !result.data) {
          return Response.json({ data: null, error: result.error });
        }

        // Get first available SKU
        const firstSku = result.data.skus?.[0];
        if (!firstSku) {
          return Response.json({
            data: null,
            error: { code: "NO_SKU", message: "No SKU available for this offer" },
          });
        }

        return Response.json({
          data: { skuId: firstSku.id, name: result.data.name },
          error: null,
        });
      },
    },
  },
});
