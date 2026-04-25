/**
 * API Route: GET /api/products
 *
 * Returns paginated product listings from Violet API.
 * Public endpoint — no authentication required.
 *
 * Query params: page, pageSize, category, minPrice, maxPrice, inStock, sortBy, sortDirection
 *
 * Delegates to the shared getProductsFn server function to ensure consistent
 * filtering (country-based shipping) and contextual pricing.
 *
 * @see audit-dual-backend.md — Phase 2 migration endpoint
 */
import { createFileRoute } from "@tanstack/react-router";
import { getProductsFn } from "#/server/getProducts";

export const Route = createFileRoute("/api/products/")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const sp = url.searchParams;

        const result = await getProductsFn({
          data: {
            category: sp.get("category") ?? undefined,
            page: sp.get("page") ? Number(sp.get("page")) : 1,
            pageSize: sp.get("pageSize") ? Number(sp.get("pageSize")) : 12,
            minPrice: sp.get("minPrice") ? Number(sp.get("minPrice")) : undefined,
            maxPrice: sp.get("maxPrice") ? Number(sp.get("maxPrice")) : undefined,
            inStock: sp.get("inStock") === "true" ? true : undefined,
            sortBy: (sp.get("sortBy") as "relevance" | "price") ?? undefined,
            sortDirection: (sp.get("sortDirection") as "ASC" | "DESC") ?? undefined,
          },
        });

        return Response.json(result);
      },
    },
  },
});
