/**
 * API Route: GET /api/exchange-rates
 *
 * Returns live currency exchange rates from Violet.
 * Public endpoint — no authentication required.
 *
 * @see audit-dual-backend.md — Phase 2 migration endpoint
 */
import { createFileRoute } from "@tanstack/react-router";
import { getAdapter } from "#/server/violetAdapter";

export const Route = createFileRoute("/api/exchange-rates")({
  server: {
    handlers: {
      GET: async () => {
        const result = await getAdapter().getExchangeRates();
        return Response.json(result.data ?? {});
      },
    },
  },
});
