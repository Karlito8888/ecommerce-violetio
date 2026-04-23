/**
 * API Route: GET /api/merchants
 *
 * Returns all connected merchants from Violet API.
 * Public endpoint — no authentication required.
 *
 * @see audit-dual-backend.md — Phase 2 migration endpoint
 */
import { createFileRoute } from "@tanstack/react-router";
import { getAdapter } from "#/server/violetAdapter";
import type { MerchantRow } from "@ecommerce/shared";

export const Route = createFileRoute("/api/merchants/")({
  server: {
    handlers: {
      GET: async () => {
        const result = await getAdapter().listMerchants();
        if (result.error || !result.data) {
          return Response.json({ data: [], error: result.error }, { status: 500 });
        }
        const sorted = result.data.sort((a: MerchantRow, b: MerchantRow) =>
          a.name.localeCompare(b.name),
        );
        return Response.json({ data: sorted, error: null });
      },
    },
  },
});
