/**
 * API Route: GET /api/orders
 *
 * Fetches the authenticated user's order history from Supabase.
 * Used by the mobile app's order list screen.
 * Requires Supabase auth (JWT in Authorization header).
 *
 * Delegates to the shared ordersHandler server function.
 *
 * @see apps/mobile/src/app/orders/index.tsx — mobile consumer
 * @see apps/web/src/routes/account/orders/index.tsx — web equivalent (direct server function)
 */
import { createFileRoute } from "@tanstack/react-router";
import { ordersHandler } from "#/server/orderHandlers";

export const Route = createFileRoute("/api/orders/")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const orders = await ordersHandler();
          return Response.json({ data: orders, error: null });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Failed to fetch orders";
          const status = message === "Not authenticated" ? 401 : 500;
          return Response.json({ data: null, error: { message } }, { status });
        }
      },
    },
  },
});
