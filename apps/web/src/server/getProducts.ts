import { createServerFn } from "@tanstack/react-start";
import type {
  ApiResponse,
  CategoryItem,
  CountryOption,
  PaginatedResult,
  Product,
  ProductQuery,
} from "@ecommerce/shared";
import { getAdapter } from "./violetAdapter";
import { getCountryCookieFn } from "./geoip";

/* ─── Types ───────────────────────────────────────────────────────────── */

/**
 * Re-export CategoryItem from @ecommerce/shared for convenience.
 *
 * Consumers (CategoryChips, Header, routes) import from this module.
 * The canonical type now lives in the shared package so both web and
 * mobile can use it without depending on server code.
 *
 * @see packages/shared/src/types/product.types.ts — CategoryItem
 * @see packages/shared/src/adapters/violetAdapter.ts — FALLBACK_CATEGORIES
 */
export type { CategoryItem } from "@ecommerce/shared";

/* ─── Server Functions ────────────────────────────────────────────────── */

/**
 * Server Function for fetching paginated product listings.
 *
 * Runs server-side only — Violet API credentials never reach the browser.
 * Called from TanStack Query's `queryFn` via the shared `productsInfiniteQueryOptions`
 * hook (through the `ProductsFetchFn` adapter pattern).
 *
 * Uses `POST /catalog/offers/search` via VioletAdapter.getProducts():
 * - Pagination: 0-based internally, 1-based for our API (adapter converts)
 * - Category filtering: passes `source_category_name` in search body
 * - Default pageSize: 12 (per UX spec — grid shows 12 products per page)
 *
 * @see https://docs.violet.io/api-reference/catalog/offers/search-offers
 */
export interface ProductsResult extends PaginatedResult<Product> {
  /** Set when filtered results are empty due to shipping restrictions. */
  emptyReason?: "no-shipping";
}

export const getProductsFn = createServerFn({ method: "GET" })
  .inputValidator((input: ProductQuery) => input)
  .handler(async ({ data }): Promise<ApiResponse<ProductsResult>> => {
    const { countryCode } = await getCountryCookieFn();
    const adapter = getAdapter();
    const result = await adapter.getProducts(
      {
        category: data.category,
        page: data.page ?? 1,
        pageSize: data.pageSize ?? 12,
        minPrice: data.minPrice,
        maxPrice: data.maxPrice,
        inStock: data.inStock,
        sortBy: data.sortBy,
        sortDirection: data.sortDirection,
      },
      countryCode ?? undefined,
    );

    if (result.error || !result.data) return result as ApiResponse<ProductsResult>;

    // Filter out Shopify products that don't ship to the user's country.
    // Preserve original pagination metadata (total, hasNext) from Violet so
    // infinite scroll continues to fetch subsequent pages.
    if (countryCode) {
      const original = result.data.data;
      const filtered = original.filter((p) => !p.shippingInfo || p.shippingInfo.shipsToUserCountry);

      const emptyReason =
        filtered.length === 0 && original.length > 0 && !result.data.hasNext
          ? "no-shipping"
          : undefined;

      return {
        data: {
          ...result.data,
          data: filtered,
          emptyReason,
        },
        error: null,
      };
    }

    return result as ApiResponse<ProductsResult>;
  });

/**
 * Server Function for fetching product categories from Violet.
 *
 * Delegates to `VioletAdapter.getCategories()` which handles:
 * - Full JWT authentication via VioletTokenManager (login, cache, refresh)
 * - Retry on HTTP 429 with exponential backoff
 * - Fallback to hardcoded categories when the API returns empty/errors
 * - Filtering to top-level categories only (depth=0)
 *
 * @returns Array of CategoryItem — always non-empty (adapter fallback guarantees this)
 * @see https://docs.violet.io/api-reference/catalog/categories/get-categories
 */
export const getCategoriesFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<CategoryItem[]> => {
    const adapter = getAdapter();
    const result = await adapter.getCategories();
    return result.data ?? [];
  },
);

/**
 * Server Function for fetching available shipping countries.
 * Used by CountrySelector to populate the country list.
 */
export const getAvailableCountriesFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<CountryOption[]> => {
    const adapter = getAdapter();
    const result = await adapter.getAvailableCountries();
    return result.data ?? [];
  },
);
