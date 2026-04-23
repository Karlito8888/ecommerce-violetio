/**
 * API Route: POST /api/cart/:cartId/shipping_address
 *
 * Sets the shipping address for the cart. Must be called before fetching shipping methods.
 * Requires Supabase auth (JWT in Authorization header).
 *
 * Body: { address_1, city, state, postal_code, country, phone? }
 *
 * @see audit-dual-backend.md — Phase 3 checkout migration
 * @see apps/web/src/server/checkout.ts — setShippingAddressFn
 */
import { createFileRoute } from "@tanstack/react-router";
import { getAdapter } from "#/server/violetAdapter";

export const Route = createFileRoute("/api/cart/$cartId/shipping_address")({
  server: {
    handlers: {
      POST: async ({ params, request }) => {
        const body = (await request.json()) as Record<string, string>;
        const adapter = getAdapter();

        const result = await adapter.setShippingAddress(params.cartId, {
          address1: body.address_1 ?? "",
          city: body.city ?? "",
          state: body.state ?? "",
          postalCode: body.postal_code ?? "",
          country: body.country ?? "",
          ...(body.phone && { phone: body.phone }),
        });

        return Response.json({ data: result.data, error: result.error });
      },
    },
  },
});
