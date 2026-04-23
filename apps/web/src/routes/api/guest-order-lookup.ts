/**
 * API Route: POST /api/guest-order-lookup
 *
 * Looks up guest orders by token or email (OTP-verified session).
 * Uses the same business logic as the web's guestOrderHandlers.
 *
 * Body: { method: "token", token: string } | { method: "email" }
 *
 * @see audit-dual-backend.md — Phase 2 migration endpoint
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/guest-order-lookup")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json()) as { method: string; token?: string };

        if (body.method === "token" && body.token) {
          const { lookupOrderByTokenHandler } = await import("../../server/guestOrderHandlers");
          const result = await lookupOrderByTokenHandler(body.token);
          return Response.json({ data: result, error: null });
        }

        if (body.method === "email") {
          const { lookupOrdersByEmailHandler } = await import("../../server/guestOrderHandlers");
          const result = await lookupOrdersByEmailHandler();
          return Response.json({ data: result, error: null });
        }

        return Response.json(
          {
            data: null,
            error: { code: "INVALID_REQUEST", message: "method must be 'token' or 'email'" },
          },
          { status: 400 },
        );
      },
    },
  },
});
