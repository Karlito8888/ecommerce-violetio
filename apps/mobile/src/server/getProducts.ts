/**
 * Mobile fetch functions via the web backend API.
 *
 * - fetchProductsMobile: paginated product listings
 * - fetchCategoriesMobile: dynamically-derived product categories
 * - fetchMerchantsMobile: merchant listing with optional offer counts
 *
 * Violet credentials stay server-side, never in the JS bundle.
 */

import type { CategoryItem, ProductsFetchFn } from "@ecommerce/shared";
import { apiGet } from "./apiClient";

/** Platform country for contextual pricing (US sandbox / FR production). */
const PLATFORM_COUNTRY = process.env.EXPO_PUBLIC_STRIPE_ACCOUNT_COUNTRY ?? "US";

export const fetchProductsMobile: ProductsFetchFn = async (params) => {
  const qs = new URLSearchParams();
  if (params.page) qs.set("page", String(params.page));
  if (params.pageSize) qs.set("pageSize", String(params.pageSize));
  if (params.category) qs.set("category", params.category);
  if (params.minPrice !== undefined) qs.set("minPrice", String(params.minPrice));
  if (params.maxPrice !== undefined) qs.set("maxPrice", String(params.maxPrice));
  if (params.inStock === true) qs.set("inStock", "true");
  if (params.sortBy) qs.set("sortBy", params.sortBy);
  if (params.sortDirection) qs.set("sortDirection", params.sortDirection);
  // Pass platform country for contextual pricing (web backend uses it for base_currency)
  qs.set("country", PLATFORM_COUNTRY);

  try {
    return await apiGet(`/api/products?${qs}`);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      "[getProducts] Failed to fetch from web backend:",
      err instanceof Error ? err.message : err,
    );
    return {
      data: null,
      error: {
        code: "GET_PRODUCTS.HTTP_ERROR",
        message: "Failed to fetch products from web backend",
      },
    };
  }
};

/**
 * Fetches dynamically-derived categories from the web backend.
 *
 * Categories are extracted from `source_category_name` on actual Violet offers,
 * guaranteeing every category maps to real products (no empty results).
 * Falls back to a minimal "All" category on error.
 *
 * @see packages/shared/src/adapters/violetCategories.ts
 * @see https://docs.violet.io/prism/catalog/categories
 */
export async function fetchCategoriesMobile(): Promise<CategoryItem[]> {
  try {
    const result = await apiGet<{ data: CategoryItem[]; error: null | unknown }>("/api/categories");
    return result.data ?? [{ slug: "all", label: "All", filter: undefined }];
  } catch {
    return [{ slug: "all", label: "All", filter: undefined }];
  }
}
