/**
 * Shared personalization utilities for Edge Functions (M5 review fix).
 *
 * ## Why this file exists
 * `extractCategory` and `applyPersonalizationBoost` were duplicated between
 * `search-products/index.ts` and `get-recommendations/index.ts`. Any bug fix
 * had to be applied in both places — a maintenance risk identified during
 * Epic 6 code review.
 *
 * Now both Edge Functions import from this single source of truth.
 *
 * ## Scoring formula
 * `final_score = 0.7 × semantic_similarity + 0.2 × category_boost + 0.1 × price_proximity`
 *
 * - **category_boost**: 1.0 for user's #1 viewed category, 0.7 #2, 0.5 #3, 0.3 #4-5, 0 otherwise
 * - **price_proximity**: 1.0 when product price equals user's avg order price, 0 at 2× distance
 * - If no order history: price_proximity = 0.5 (neutral — no boost or penalty)
 *
 * ## Data source
 * User profiles come from `get_user_search_profile()` SQL function (Story 6.3 migration).
 * Product categories are extracted from `product_embeddings.text_content` field.
 *
 * @module _shared/personalization
 */

// Keep in sync with packages/shared/src/types/personalization.types.ts
export interface CategoryAffinity {
  category: string;
  view_count: number;
}

export interface UserSearchProfile {
  top_categories: CategoryAffinity[];
  avg_order_price: number;
  recent_product_ids: string[];
  total_events: number;
}

/**
 * Extracts a product category from the text_content field.
 *
 * text_content format (from generate-embeddings Edge Function):
 *   "Product Name. Description text. Brand: MerchantName. Category: Electronics. Tags: a, b, c"
 *
 * This regex-based extraction is fragile if the text_content format changes.
 * If extraction fails, `category_boost` defaults to 0 (no boost, no penalty).
 *
 * @param textContent - The full text_content from product_embeddings table
 * @returns The extracted category string, or null if not found
 */
export function extractCategory(textContent: string): string | null {
  const match = textContent.match(/Category:\s*([^.]+)/i);
  return match ? match[1].trim() : null;
}

/**
 * Applies personalization boosting to search/recommendation results.
 *
 * Mutates the `similarity` field of each product with the weighted final score,
 * then re-sorts by descending score. The original semantic similarity is blended
 * with user preference signals.
 *
 * @param products - Enriched product objects with `id`, `similarity`, `minPrice`
 * @param profile - User's search profile from `get_user_search_profile()` RPC
 * @param textContentMap - Map of product_id → text_content for category extraction
 * @returns New array of products sorted by boosted final score (descending)
 */
export function applyPersonalizationBoost(
  products: Array<Record<string, unknown>>,
  profile: UserSearchProfile,
  textContentMap: Map<string, string>,
): Array<Record<string, unknown>> {
  const categoryBoostMap = new Map<string, number>();
  const boostValues = [1.0, 0.7, 0.5, 0.3, 0.3];
  profile.top_categories.forEach((cat, i) => {
    categoryBoostMap.set(cat.category.toLowerCase(), boostValues[i] ?? 0.3);
  });

  const boosted = products.map((product) => {
    const textContent = textContentMap.get(product.id as string) ?? "";
    const originalSimilarity = product.similarity as number;

    const productCategory = extractCategory(textContent);
    const categoryBoost = productCategory
      ? (categoryBoostMap.get(productCategory.toLowerCase()) ?? 0)
      : 0;

    let priceProximity = 0.5;
    if (profile.avg_order_price > 0) {
      const productPrice = product.minPrice as number;
      const priceDiff = Math.abs(productPrice - profile.avg_order_price);
      priceProximity = Math.max(0, 1 - Math.min(priceDiff / profile.avg_order_price, 1));
    }

    const finalScore = originalSimilarity * 0.7 + categoryBoost * 0.2 + priceProximity * 0.1;

    return {
      ...product,
      similarity: Math.round(finalScore * 10000) / 10000,
    };
  });

  return boosted.sort((a, b) => (b.similarity as number) - (a.similarity as number));
}
