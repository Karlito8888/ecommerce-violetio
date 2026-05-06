/**
 * API Route: GET /api/orders/:orderId
 *
 * Fetches order details. Supports two data sources:
 *
 * 1. **Violet API** (default): Used by mobile confirmation screen after checkout.
 *    Returns Violet's OrderDetail type. Delegates to getOrderDetailsFn.
 *
 * 2. **Supabase** (?source=supabase): Used by mobile order detail page for
 *    authenticated order history with Realtime updates. Returns OrderWithBagsAndItems
 *    with nested bags, items, and refunds from our Supabase mirror.
 *    Delegates to orderDetailHandler (same data source as web's /account/orders/$orderId).
 *
 * Requires Supabase auth (JWT in Authorization header).
 *
 * @see apps/mobile/src/app/orders/[orderId].tsx — mobile consumer (Supabase source)
 * @see apps/mobile/src/app/order/[orderId]/confirmation.tsx — mobile consumer (Violet source)
 * @see audit-dual-backend.md — Phase 3 checkout migration
 */
import { createFileRoute } from "@tanstack/react-router";
import { getOrderDetailsFn } from "#/server/checkout";
import { orderDetailHandler } from "#/server/orderHandlers";

export const Route = createFileRoute("/api/orders/$orderId")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const url = new URL(request.url);
        const source = url.searchParams.get("source");

        // Supabase source: return order from our DB with nested bags/items/refunds
        // This is the same data source as the web's /account/orders/$orderId page
        if (source === "supabase") {
          try {
            const order = await orderDetailHandler(params.orderId);
            return Response.json({ data: order, error: null });
          } catch (err) {
            const message = err instanceof Error ? err.message : "Failed to fetch order";
            const status = message === "Not authenticated" ? 401 : 500;
            return Response.json({ data: null, error: { message } }, { status });
          }
        }

        // Default: Violet API source (for checkout confirmation)
        const result = await getOrderDetailsFn({ data: { orderId: params.orderId } });
        return Response.json(result);
      },
    },
  },
});
