/**
 * API Route: GET /api/exchange-rates
 *
 * Returns live currency exchange rates from Violet.
 * Public endpoint — no authentication required.
 *
 * Delegates to the shared getExchangeRatesFn server function.
 *
 * @see audit-dual-backend.md — Phase 2 migration endpoint
 */
import { createFileRoute } from "@tanstack/react-router";
import { getExchangeRatesFn } from "#/server/exchangeRates";

export const Route = createFileRoute("/api/exchange-rates")({
  server: {
    handlers: {
      GET: async () => {
        const result = await getExchangeRatesFn();
        return Response.json(result ?? {});
      },
    },
  },
});
