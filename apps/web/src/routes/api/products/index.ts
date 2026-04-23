/**
 * API Route: GET /api/products
 *
 * Returns paginated product listings from Violet API.
 * Public endpoint — no authentication required.
 *
 * Query params: page, pageSize, category, minPrice, maxPrice, inStock, sortBy, sortDirection
 *
 * @see audit-dual-backend.md — Phase 2 migration endpoint
 */
import { createFileRoute } from "@tanstack/react-router";
import { getAdapter } from "#/server/violetAdapter";
import { getCountryCookieFn } from "#/server/geoip";
import type { Product } from "@ecommerce/shared";

export const Route = createFileRoute("/api/products/")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const sp = url.searchParams;

        const { countryCode } = await getCountryCookieFn();
        const adapter = getAdapter();

        const result = await adapter.getProducts(
          {
            category: sp.get("category") ?? undefined,
            page: sp.get("page") ? Number(sp.get("page")) : 1,
            pageSize: sp.get("pageSize") ? Number(sp.get("pageSize")) : 12,
            minPrice: sp.get("minPrice") ? Number(sp.get("minPrice")) : undefined,
            maxPrice: sp.get("maxPrice") ? Number(sp.get("maxPrice")) : undefined,
            inStock: sp.get("inStock") === "true" ? true : undefined,
            sortBy: (sp.get("sortBy") as "relevance" | "price") ?? undefined,
            sortDirection: (sp.get("sortDirection") as "ASC" | "DESC") ?? undefined,
          },
          countryCode ?? undefined,
        );

        if (result.error || !result.data) {
          return Response.json({ data: null, error: result.error }, { status: 500 });
        }

        // Filter out products that don't ship to user's country
        let filtered = result.data.data;
        if (countryCode) {
          filtered = filtered.filter(
            (p: Product) => !p.shippingInfo || p.shippingInfo.shipsToUserCountry,
          );
        }

        return Response.json({
          data: {
            ...result.data,
            data: filtered,
          },
          error: null,
        });
      },
    },
  },
});
