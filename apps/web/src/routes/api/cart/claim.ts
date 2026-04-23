/**
 * API Route: POST /api/cart/claim
 *
 * Claims an anonymous cart for the authenticated user.
 * Updates the Supabase carts row to associate it with the user.
 * Requires Supabase auth (JWT in Authorization header).
 *
 * Body: { violetCartId: string }
 *
 * @see audit-dual-backend.md — Phase 3 cart sync migration
 */
import { createFileRoute } from "@tanstack/react-router";
import { getSupabaseServer } from "#/server/supabaseServer";

export const Route = createFileRoute("/api/cart/claim")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authHeader = request.headers.get("Authorization");
        if (!authHeader?.startsWith("Bearer ")) {
          return Response.json({ success: false }, { status: 401 });
        }

        const token = authHeader.slice(7);
        const body = (await request.json()) as { violetCartId?: string };
        const supabase = getSupabaseServer();

        const {
          data: { user },
        } = await supabase.auth.getUser(token);

        if (!user || !body.violetCartId) {
          return Response.json({ success: false }, { status: 401 });
        }

        await supabase
          .from("carts")
          .update({ user_id: user.id })
          .eq("violet_cart_id", body.violetCartId)
          .is("user_id", null);

        return Response.json({ success: true });
      },
    },
  },
});
