/**
 * API Route: GET /api/cart/:cartId/orders/:orderId
 *
 * Fetches order details for the confirmation page.
 * Requires Supabase auth (JWT in Authorization header).
 *
 * Delegates to the shared getOrderDetailsFn server function.
 *
 * @see audit-dual-backend.md — Phase 3 checkout migration
 */
import { createFileRoute } from "@tanstack/react-router";
import { getOrderDetailsFn } from "#/server/checkout";

export const Route = createFileRoute("/api/cart/$cartId/orders/$orderId")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const result = await getOrderDetailsFn({ data: { orderId: params.orderId } });
        return Response.json(result);
      },
    },
  },
});
