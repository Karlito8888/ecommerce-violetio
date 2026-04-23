/**
 * API Route: GET /api/cart/user
 *
 * Fetches the authenticated user's existing Violet cart ID from Supabase.
 * Used for cart merge on anonymous → authenticated transition.
 * Requires Supabase auth (JWT in Authorization header).
 *
 * @see audit-dual-backend.md — Phase 3 cart sync migration
 */
import { createFileRoute } from "@tanstack/react-router";
import { getSupabaseServer } from "#/server/supabaseServer";

export const Route = createFileRoute("/api/cart/user")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const authHeader = request.headers.get("Authorization");
        if (!authHeader?.startsWith("Bearer ")) {
          return Response.json({ violetCartId: null }, { status: 401 });
        }

        const token = authHeader.slice(7);
        const supabase = getSupabaseServer();

        // Verify the JWT and get user
        const {
          data: { user },
        } = await supabase.auth.getUser(token);

        if (!user) {
          return Response.json({ violetCartId: null }, { status: 401 });
        }

        // Look up user's most recent active cart
        const { data: cart } = await supabase
          .from("carts")
          .select("violet_cart_id")
          .eq("user_id", user.id)
          .eq("status", "active")
          .order("created_at", { ascending: false })
          .limit(1)
          .single();

        return Response.json({ violetCartId: cart?.violet_cart_id ?? null });
      },
    },
  },
});
