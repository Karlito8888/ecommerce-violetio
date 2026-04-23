/**
 * API Route: POST /api/cart
 *
 * Creates a new Violet cart. Returns the cart object with cart ID.
 * Requires Supabase auth (JWT in Authorization header).
 *
 * Body: { walletBasedCheckout?: boolean }
 *
 * @see audit-dual-backend.md — Phase 2 migration endpoint (cart subset)
 * @see apps/web/src/server/cartActions.ts — createCartFn
 */
import { createFileRoute } from "@tanstack/react-router";
import { getAdapter } from "#/server/violetAdapter";
import type { CreateCartInput } from "@ecommerce/shared";

export const Route = createFileRoute("/api/cart/")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json()) as Partial<CreateCartInput>;
        const adapter = getAdapter();

        const input: CreateCartInput = {
          userId: body.userId ?? null,
          sessionId: body.sessionId ?? null,
          ...(body.skus && { skus: body.skus }),
          ...(body.customer && { customer: body.customer }),
        };

        const result = await adapter.createCart(input);
        return Response.json({ data: result.data, error: result.error });
      },
    },
  },
});
