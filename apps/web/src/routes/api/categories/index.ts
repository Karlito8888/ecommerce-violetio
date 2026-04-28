/**
 * API Route: GET /api/categories
 *
 * Returns dynamically-derived product categories from Violet API.
 * Public endpoint — no authentication required.
 *
 * Categories are extracted from `source_category_name` on actual offers,
 * guaranteeing every category maps to real products.
 *
 * Delegates to the shared getCategoriesFn server function.
 *
 * @see packages/shared/src/adapters/violetCategories.ts — derive logic
 * @see https://docs.violet.io/prism/catalog/categories
 */
import { createFileRoute } from "@tanstack/react-router";
import { getCategoriesFn } from "#/server/getProducts";

export const Route = createFileRoute("/api/categories/")({
  server: {
    handlers: {
      GET: async () => {
        const categories = await getCategoriesFn();

        return new Response(JSON.stringify({ data: categories, error: null }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
