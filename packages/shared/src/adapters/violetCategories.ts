/**
 * Violet category operations: getCategories + helper functions.
 *
 * Categories are dynamically derived from offer data rather than a
 * fixed taxonomy, guaranteeing every category has real products.
 */

import type { ApiResponse, CategoryItem } from "../types/index.js";
import { fetchWithRetry } from "./violetFetch.js";
import type { CatalogContext } from "./violetCatalog.js";
import {
  _demoOffersCache,
  _categoriesCache,
  CATEGORIES_CACHE_TTL_MS,
  DEMO_CACHE_TTL_MS,
  setDemoOffersCache,
  setCategoriesCache,
} from "./violetConstants.js";

/**
 * Fetches product categories derived from actual offer data.
 *
 * ## Strategy: derive from offers, not taxonomy
 *
 * Violet products carry a `source_category_name` field (e.g., "Clothing", "Home")
 * that is used for filtering via `POST /catalog/offers/search`. Rather than
 * navigating the Google Product Taxonomy tree (5000+ categories across 100+ pages),
 * we extract categories directly from the offers we have access to.
 *
 * This guarantees:
 * - Every nav category corresponds to real products (no empty results)
 * - Filter values match exactly what the search API expects (`source_category_name`)
 * - New merchant categories appear automatically
 * - No hardcoded fallback categories needed
 *
 * ## Caching
 *
 * Results are cached for 5 minutes in memory. Categories rarely change — they
 * only shift when merchants add/remove products with new categories.
 *
 * @see https://docs.violet.io/prism/catalog/categories
 * @see https://docs.violet.io/api-reference/catalog/offers/search-offers
 */
export async function getCategories(ctx: CatalogContext): Promise<ApiResponse<CategoryItem[]>> {
  // Return cached categories if still fresh
  if (_categoriesCache && Date.now() < _categoriesCache.expiresAt) {
    return { data: _categoriesCache.data, error: null };
  }

  try {
    const offerCategories = await deriveCategoriesFromOffers(ctx);

    // Always prepend "All" — capped at 6 total (All + 5 categories)
    const result: CategoryItem[] = [
      { slug: "all", label: "All", filter: undefined },
      ...offerCategories.slice(0, 5),
    ];

    // Cache for 5 minutes
    setCategoriesCache({
      data: result,
      expiresAt: Date.now() + CATEGORIES_CACHE_TTL_MS,
    });

    return { data: result, error: null };
  } catch {
    // API unreachable — return just "All" (no hardcoded categories)
    return { data: [{ slug: "all", label: "All", filter: undefined }], error: null };
  }
}

/**
 * Extracts unique `source_category_name` values from available offers.
 *
 * Two-phase approach:
 * 1. **Search endpoint** (`POST /catalog/offers/search`) — works in production.
 * 2. **Merchant fallback** — fetches from each merchant directly. Needed in Demo Mode.
 *
 * @returns CategoryItem[] derived from real product data (without "All")
 */
async function deriveCategoriesFromOffers(ctx: CatalogContext): Promise<CategoryItem[]> {
  // Phase 1: Try the search endpoint (works in production)
  const searchResult = await fetchWithRetry(
    `${ctx.apiBase}/catalog/offers/search?page=0&size=100`,
    { method: "POST", body: JSON.stringify({}) },
    ctx.tokenManager,
  );

  if (!searchResult.error && searchResult.data) {
    const data = searchResult.data as {
      content?: Array<{ source_category_name?: string }>;
    };
    const offers = data.content ?? [];
    if (offers.length > 0) {
      return extractCategoriesFromRawOffers(offers);
    }
  }

  // Phase 2: Demo mode — fetch from merchants directly
  let rawOffers: Array<{ source_category_name?: string; merchant_id?: number }>;
  const now = Date.now();

  // Reuse _demoOffersCache if fresh (shared with getProductsFromMerchants)
  if (_demoOffersCache && _demoOffersCache.expiresAt > now) {
    rawOffers = _demoOffersCache.rawOffers as Array<{
      source_category_name?: string;
      merchant_id?: number;
    }>;
  } else {
    const merchantsResult = await fetchWithRetry(
      `${ctx.apiBase}/merchants?page=1&size=50`,
      { method: "GET" },
      ctx.tokenManager,
    );
    if (merchantsResult.error) return [];

    const merchantsData = merchantsResult.data as {
      content: Array<{ id: number }>;
    };
    const merchantIds = merchantsData.content.map((m) => m.id);
    if (merchantIds.length === 0) return [];

    const offerPromises = merchantIds.map(async (merchantId) => {
      const res = await fetchWithRetry(
        `${ctx.apiBase}/catalog/offers/merchants/${merchantId}?page=1&size=100`,
        { method: "GET" },
        ctx.tokenManager,
      );
      if (res.error || !res.data) return [];
      const d = res.data as { content?: unknown[] };
      return d.content ?? [];
    });

    const allOfferArrays = await Promise.all(offerPromises);
    rawOffers = allOfferArrays.flat() as Array<{
      source_category_name?: string;
      merchant_id?: number;
    }>;

    // Cache for subsequent requests (shared with getProductsFromMerchants)
    setDemoOffersCache({
      rawOffers: rawOffers as unknown[],
      expiresAt: now + DEMO_CACHE_TTL_MS,
    });
  }

  return extractCategoriesFromRawOffers(rawOffers);
}

/**
 * Extracts unique `source_category_name` values from raw offers.
 *
 * Products with an empty `source_category_name` are grouped under an "Other"
 * category.
 */
export function extractCategoriesFromRawOffers(
  offers: Array<{ source_category_name?: string }>,
): CategoryItem[] {
  const seen = new Set<string>();
  const categories: CategoryItem[] = [];
  let hasUncategorized = false;

  for (const offer of offers) {
    const cat = offer.source_category_name?.trim();
    if (cat) {
      if (!seen.has(cat)) {
        seen.add(cat);
        categories.push({
          slug: cat.toLowerCase().replace(/\s+/g, "-"),
          label: cat,
          filter: cat,
        });
      }
    } else {
      hasUncategorized = true;
    }
  }

  if (hasUncategorized) {
    categories.push({ slug: "other", label: "Other", filter: "" });
  }

  return categories;
}
