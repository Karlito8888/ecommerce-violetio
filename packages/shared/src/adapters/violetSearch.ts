/**
 * Violet search operations (stub — actual search uses Supabase pgvector).
 */

import type { ApiResponse, SearchResult, SearchFilters } from "../types/index.js";

/**
 * Search products via AI semantic search.
 *
 * This is a no-op stub. The actual AI search pipeline is:
 *   useSearch() hook → supabase.functions.invoke("search-products") → Edge Function
 *
 * @returns Empty results — use useSearch() hook for actual search functionality
 */
export async function searchProducts(
  query: string,
  _filters?: SearchFilters,
): Promise<ApiResponse<SearchResult>> {
  return {
    data: { query, products: [], total: 0, explanations: {} },
    error: null,
  };
}
