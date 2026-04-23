/**
 * API Route: POST /api/cart/:cartId/billing_address
 *
 * Sets a billing address different from shipping on the cart.
 * Requires Supabase auth (JWT in Authorization header).
 *
 * Body: { address_1, city, state, postal_code, country }
 *
 * @see audit-dual-backend.md — Phase 3 checkout migration
 * @see apps/web/src/server/checkout.ts — setBillingAddressFn
 */
import { createFileRoute } from "@tanstack/react-router";
import { getAdapter } from "#/server/violetAdapter";

export const Route = createFileRoute("/api/cart/$cartId/billing_address")({
  server: {
    handlers: {
      POST: async ({ params, request }) => {
        const body = (await request.json()) as Record<string, string>;
        const adapter = getAdapter();

        const result = await adapter.setBillingAddress(params.cartId, {
          address1: body.address_1 ?? "",
          city: body.city ?? "",
          state: body.state ?? "",
          postalCode: body.postal_code ?? "",
          country: body.country ?? "",
        });

        return Response.json({ data: result.data, error: result.error });
      },
    },
  },
});
