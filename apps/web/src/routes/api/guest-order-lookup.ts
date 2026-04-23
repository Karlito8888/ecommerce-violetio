/**
 * API Route: POST /api/guest-order-lookup
 *
 * Looks up guest orders by token or email (OTP-verified session).
 * Uses the same business logic as the web's guestOrderHandlers.
 *
 * Body: { type: "token", token: string } | { type: "email" }
 *
 * The `type` field matches the original Edge Function contract used by mobile.
 *
 * ## Auth
 * - Token mode: no auth required — the token itself is the secret.
 * - Email mode: requires Supabase JWT in Authorization header (from OTP verification).
 *   The JWT's email claim is extracted server-side to query orders.
 *
 * @see audit-dual-backend.md — Phase 2 migration endpoint
 * @see supabase/functions/guest-order-lookup/index.ts — original Edge Function (same body format)
 */
import { createFileRoute } from "@tanstack/react-router";
import { getSupabaseServer } from "#/server/supabaseServer";

export const Route = createFileRoute("/api/guest-order-lookup")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json()) as { type: string; token?: string };

        if (body.type === "token" && body.token) {
          const { lookupOrderByTokenHandler } = await import("../../server/guestOrderHandlers");
          const result = await lookupOrderByTokenHandler(body.token);
          return Response.json({ data: result, error: null });
        }

        if (body.type === "email") {
          // Email mode requires a valid Supabase JWT from OTP verification.
          // The mobile app sends this via the Authorization header.
          // We extract the email from the JWT and query orders by that email.
          const authHeader = request.headers.get("Authorization");
          if (!authHeader?.startsWith("Bearer ")) {
            return Response.json(
              { data: null, error: { code: "UNAUTHORIZED", message: "Authorization required" } },
              { status: 401 },
            );
          }

          const jwt = authHeader.slice(7);
          const supabase = getSupabaseServer();

          // Verify the JWT and extract the email claim
          const {
            data: { user },
            error: authError,
          } = await supabase.auth.getUser(jwt);

          if (authError || !user?.email) {
            return Response.json(
              {
                data: null,
                error: { code: "INVALID_TOKEN", message: "Invalid or expired session" },
              },
              { status: 401 },
            );
          }

          // Query orders by the verified email (service_role bypasses RLS)
          const { data, error } = await supabase
            .from("orders")
            .select("*, order_bags(*, order_items(*), order_refunds(*))")
            .eq("email", user.email)
            .order("created_at", { ascending: false });

          if (error) {
            return Response.json(
              {
                data: null,
                error: { code: "QUERY_ERROR", message: "Failed to query orders" },
              },
              { status: 500 },
            );
          }

          return Response.json({ data: data ?? [], error: null });
        }

        return Response.json(
          {
            data: null,
            error: { code: "INVALID_REQUEST", message: "type must be 'token' or 'email'" },
          },
          { status: 400 },
        );
      },
    },
  },
});
