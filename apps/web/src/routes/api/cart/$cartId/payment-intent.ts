/**
 * API Route: GET /api/cart/:cartId/payment-intent
 *
 * Retrieves the Stripe PaymentIntent client secret and stripe_key for the cart.
 * Used by mobile to initialize Stripe PaymentSheet.
 * Requires Supabase auth (JWT in Authorization header).
 *
 * @see audit-dual-backend.md — Phase 3 checkout migration
 * @see apps/web/src/server/checkout.ts — getPaymentIntentFn
 */
import { createFileRoute } from "@tanstack/react-router";
import { getAdapter } from "#/server/violetAdapter";

export const Route = createFileRoute("/api/cart/$cartId/payment-intent")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const adapter = getAdapter();
        const result = await adapter.getPaymentIntent(params.cartId);
        return Response.json({ data: result.data, error: result.error });
      },
    },
  },
});
