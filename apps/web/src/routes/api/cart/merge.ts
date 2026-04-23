/**
 * API Route: POST /api/cart/merge
 *
 * Merges an anonymous cart's items into an existing authenticated user's cart.
 * Used on anonymous → authenticated transition when user has an existing cart.
 * Requires Supabase auth (JWT in Authorization header).
 *
 * Body: { anonymousVioletCartId: string, targetVioletCartId: string }
 *
 * @see audit-dual-backend.md — Phase 3 cart sync migration
 */
import { createFileRoute } from "@tanstack/react-router";
import { getAdapter } from "#/server/violetAdapter";

export const Route = createFileRoute("/api/cart/merge")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authHeader = request.headers.get("Authorization");
        if (!authHeader?.startsWith("Bearer ")) {
          return Response.json({ success: false }, { status: 401 });
        }

        const body = (await request.json()) as {
          anonymousVioletCartId?: string;
          targetVioletCartId?: string;
        };

        if (!body.anonymousVioletCartId || !body.targetVioletCartId) {
          return Response.json({ success: false, error: "Missing cart IDs" }, { status: 400 });
        }

        const adapter = getAdapter();

        // Fetch anonymous cart to get its SKUs
        const sourceResult = await adapter.getCart(body.anonymousVioletCartId);
        if (sourceResult.error || !sourceResult.data) {
          return Response.json({ success: false, error: sourceResult.error?.message });
        }

        // Add each item from anonymous cart to target cart
        for (const bag of sourceResult.data.bags) {
          for (const item of bag.items) {
            await adapter.addToCart(body.targetVioletCartId, {
              skuId: item.skuId,
              quantity: item.quantity,
            });
          }
        }

        return Response.json({ success: true });
      },
    },
  },
});
