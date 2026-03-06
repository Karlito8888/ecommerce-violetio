/**
 * Search-related placeholder types.
 * Full implementation in Story 3.5 (AI conversational search — edge function & embeddings).
 */

import type { Product } from "./product.types.js";

/** Filters that can be applied to a product search. */
export interface SearchFilters {
  category?: string;
  /** Minimum price filter in integer cents */
  minPrice?: number;
  /** Maximum price filter in integer cents */
  maxPrice?: number;
  merchantId?: string;
}

/** The result of a semantic/AI product search. */
export interface SearchResult {
  query: string;
  products: Product[];
  total: number;
}
