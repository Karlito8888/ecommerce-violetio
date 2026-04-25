/**
 * API Route: GET /api/orders/:orderId
 *
 * Fetches order details by Violet order ID.
 * Used by mobile confirmation screen.
 * Requires Supabase auth (JWT in Authorization header).
 *
 * Delegates to the shared getOrderDetailsFn server function.
 *
 * @see audit-dual-backend.md — Phase 3 checkout migration
 */
import { createFileRoute } from "@tanstack/react-router";
import { getOrderDetailsFn } from "#/server/checkout";

export const Route = createFileRoute("/api/orders/$orderId")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const result = await getOrderDetailsFn({ data: { orderId: params.orderId } });
        return Response.json(result);
      },
    },
  },
});
