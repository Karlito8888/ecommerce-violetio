/**
 * API Route: POST /api/cart/:cartId/submit
 *
 * Submits the cart to Violet, turning it into an order.
 * Requires Supabase auth (JWT in Authorization header).
 *
 * Body: { app_order_id: string }
 *
 * @see audit-dual-backend.md — Phase 3 checkout migration
 * @see apps/web/src/server/checkout.ts — submitOrderFn
 */
import { createFileRoute } from "@tanstack/react-router";
import { getAdapter } from "#/server/violetAdapter";

export const Route = createFileRoute("/api/cart/$cartId/submit")({
  server: {
    handlers: {
      POST: async ({ params, request }) => {
        const body = (await request.json()) as { app_order_id?: string };
        const adapter = getAdapter();
        const result = await adapter.submitOrder(
          params.cartId,
          body.app_order_id ?? crypto.randomUUID(),
        );
        return Response.json({ data: result.data, error: result.error });
      },
    },
  },
});
