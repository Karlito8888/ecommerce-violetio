/**
 * Search types for AI conversational search.
 * Story 3.5: Edge Function & Embeddings backend.
 */

import type { Product } from "./product.types.js";

/** Filters that can be applied to a product search. */
export interface SearchFilters {
  category?: string;
  /** Minimum price filter in integer cents */
  minPrice?: number;
  /** Maximum price filter in integer cents */
  maxPrice?: number;
  /** Filter by stock availability */
  inStock?: boolean;
  merchantId?: string;
}

/** Input parameters for a search query. */
export interface SearchQuery {
  query: string;
  filters?: SearchFilters;
  limit?: number;
}

/**
 * A product match from the search-products Edge Function.
 *
 * ## Why this does NOT extend Product (H2 code review fix)
 *
 * The search-products Edge Function returns a **subset** of product fields
 * (enriched from Violet API) plus a similarity score. It does NOT return all
 * ~25+ fields from the full Product type (no skus, albums, variants, images,
 * htmlDescription, etc.).
 *
 * If this extended Product, TypeScript would claim fields like `.skus` and
 * `.albums` exist at compile time, but they'd be `undefined` at runtime —
 * a type lie that causes silent bugs in consuming code.
 *
 * The full Product type is used by product detail/listing pages via
 * VioletAdapter.getProduct(). Search results intentionally carry less data
 * since they're meant for result cards, not full product views.
 */
export interface ProductMatch {
  id: string;
  name: string;
  description: string;
  /** Lowest SKU price in integer cents. */
  minPrice: number;
  /** Highest SKU price in integer cents. */
  maxPrice: number;
  currency: string;
  available: boolean;
  vendor: string;
  /** Merchant platform source (e.g., "Shopify", "WooCommerce"). */
  source: string;
  /** Original product URL on the merchant's site. */
  externalUrl: string;
  /** Primary image URL, or null if the product has no images. */
  thumbnailUrl: string | null;
  /** Cosine similarity score (0–1) from pgvector search. Higher = more relevant. */
  similarity: number;
}

/** Match explanations keyed by product ID. */
export type MatchExplanations = Record<string, string>;

/** The response from the search-products Edge Function. */
export interface SearchResponse {
  query: string;
  products: ProductMatch[];
  total: number;
  explanations: MatchExplanations;
  /** True when results were personalized based on user history (Story 6.3). */
  personalized?: boolean;
  /** Human-readable personalization hint, shown above results. */
  personalizationHint?: string;
}

/** The result of a semantic/AI product search (adapter-level). */
export interface SearchResult {
  query: string;
  products: Product[];
  total: number;
  explanations: MatchExplanations;
}
