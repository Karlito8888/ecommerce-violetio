/**
 * API Route: GET /api/cart/:cartId/orders/:orderId
 *
 * Fetches order details for the confirmation page.
 * Requires Supabase auth (JWT in Authorization header).
 *
 * @see audit-dual-backend.md — Phase 3 checkout migration
 * @see apps/web/src/server/checkout.ts — getOrderDetailsFn
 */
import { createFileRoute } from "@tanstack/react-router";
import { getAdapter } from "#/server/violetAdapter";

export const Route = createFileRoute("/api/cart/$cartId/orders/$orderId")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const adapter = getAdapter();
        const result = await adapter.getOrder(params.orderId);
        return Response.json({ data: result.data, error: result.error });
      },
    },
  },
});
