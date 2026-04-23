/**
 * API Route: POST /api/cart/:cartId/customer
 *
 * Sets guest customer info on the cart.
 * Requires Supabase auth (JWT in Authorization header).
 *
 * Body: { email, first_name, last_name, communication_preferences? }
 *
 * @see audit-dual-backend.md — Phase 3 checkout migration
 * @see apps/web/src/server/checkout.ts — setCustomerFn
 */
import { createFileRoute } from "@tanstack/react-router";
import { getAdapter } from "#/server/violetAdapter";
import type { CustomerInput } from "@ecommerce/shared";

export const Route = createFileRoute("/api/cart/$cartId/customer")({
  server: {
    handlers: {
      POST: async ({ params, request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        const adapter = getAdapter();

        const input: CustomerInput = {
          email: String(body.email ?? ""),
          firstName: String(body.first_name ?? ""),
          lastName: String(body.last_name ?? ""),
          ...(Array.isArray(body.communication_preferences) ? { marketingConsent: true } : {}),
        };

        const result = await adapter.setCustomer(params.cartId, input);
        return Response.json({ data: result.data, error: result.error });
      },
    },
  },
});
