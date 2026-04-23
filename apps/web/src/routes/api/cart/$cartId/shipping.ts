/**
 * API Route: POST /api/cart/:cartId/shipping
 *
 * Applies shipping method selections for all bags. Returns priced cart.
 * Requires Supabase auth (JWT in Authorization header).
 *
 * Body: [{ bag_id: number, shipping_method_id: string }] — one per bag
 *
 * @see audit-dual-backend.md — Phase 3 checkout migration
 * @see apps/web/src/server/checkout.ts — setShippingMethodsFn
 */
import { createFileRoute } from "@tanstack/react-router";
import { getAdapter } from "#/server/violetAdapter";
import type { SetShippingMethodInput } from "@ecommerce/shared";

export const Route = createFileRoute("/api/cart/$cartId/shipping")({
  server: {
    handlers: {
      POST: async ({ params, request }) => {
        const body = (await request.json()) as SetShippingMethodInput[];
        const adapter = getAdapter();
        const result = await adapter.setShippingMethods(params.cartId, body);
        return Response.json({ data: result.data, error: result.error });
      },
    },
  },
});
