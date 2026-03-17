/**
 * Types for product recommendations (Story 6.5).
 *
 * RecommendationItem reuses the same fields as ProductMatch from search —
 * both represent enriched product data returned from an Edge Function.
 */

import type { ProductMatch } from "./search.types.js";

/**
 * A recommended product from the get-recommendations Edge Function.
 * Identical shape to ProductMatch — both come from pgvector + Violet enrichment.
 */
export type RecommendationItem = ProductMatch;

/** The response from the get-recommendations Edge Function. */
export interface RecommendationResponse {
  products: RecommendationItem[];
  /** True when results were personalized based on user browsing history. */
  personalized: boolean;
}

/** Function type for fetching recommendations. */
export type RecommendationFetchFn = (productId: string) => Promise<RecommendationResponse>;
