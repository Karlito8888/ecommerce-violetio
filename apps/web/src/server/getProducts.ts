import { createServerFn } from "@tanstack/react-start";
import { createSupplierAdapter } from "@ecommerce/shared";
import type { ApiResponse, PaginatedResult, Product, ProductQuery } from "@ecommerce/shared";

/* ─── Types ───────────────────────────────────────────────────────────── */

/**
 * A single category item for the category chip bar.
 *
 * - `slug`: URL-friendly identifier (used as React key)
 * - `label`: Display text shown in the chip
 * - `filter`: Value sent as `source_category_name` to Violet's search API.
 *   `undefined` means "show all products" (no category filter).
 *
 * @see https://docs.violet.io/api-reference/catalog/offers/search-offers
 */
export interface CategoryItem {
  slug: string;
  label: string;
  filter: string | undefined;
}

/**
 * Hardcoded fallback categories for when the Violet sandbox returns empty data.
 *
 * ## Why hardcoded fallback?
 *
 * Violet's `GET /catalog/categories` requires full authentication (JWT token)
 * and the sandbox environment may return empty category lists depending on
 * which merchants are available. Rather than showing zero categories (broken UX),
 * we fall back to a curated set that maps to common `source_category_name` values.
 *
 * ## IMPORTANT: Header.tsx CATEGORY_LINKS must match these filter values
 *
 * The `filter` values here are compared against the URL `?category=` param
 * to determine which chip appears active. If Header.tsx sends different values,
 * no chip will be highlighted.
 *
 * @see https://docs.violet.io/api-reference/catalog/categories/get-categories
 */
export const FALLBACK_CATEGORIES: CategoryItem[] = [
  { slug: "all", label: "All", filter: undefined },
  { slug: "home", label: "Home & Living", filter: "Home" },
  { slug: "fashion", label: "Fashion", filter: "Clothing" },
  { slug: "gifts", label: "Gifts", filter: "Gifts" },
  { slug: "beauty", label: "Beauty", filter: "Beauty" },
  { slug: "accessories", label: "Accessories", filter: "Accessories" },
];

/* ─── Adapter Factory ─────────────────────────────────────────────────── */

/**
 * Loads Violet config from env vars and creates a SupplierAdapter.
 *
 * The adapter factory (`createSupplierAdapter`) encapsulates all
 * Violet-specific logic: auth token lifecycle, request signing,
 * retry with exponential backoff, and snake_case → camelCase mapping.
 *
 * @returns A configured SupplierAdapter, or throws if env vars are missing
 */
function getAdapter() {
  const appId = process.env.VIOLET_APP_ID;
  const appSecret = process.env.VIOLET_APP_SECRET;
  const username = process.env.VIOLET_USERNAME;
  const password = process.env.VIOLET_PASSWORD;
  const apiBase = process.env.VIOLET_API_BASE ?? "https://sandbox-api.violet.io/v1";

  if (!appId || !appSecret || !username || !password) {
    throw new Error(
      "Missing required Violet env vars: VIOLET_APP_ID, VIOLET_APP_SECRET, VIOLET_USERNAME, VIOLET_PASSWORD",
    );
  }

  return createSupplierAdapter({
    supplier: "violet",
    violet: { appId, appSecret, username, password, apiBase },
  });
}

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
export const getProductsFn = createServerFn({ method: "GET" })
  .inputValidator((input: ProductQuery) => input)
  .handler(async ({ data }): Promise<ApiResponse<PaginatedResult<Product>>> => {
    const adapter = getAdapter();
    return adapter.getProducts({
      category: data.category,
      page: data.page ?? 1,
      pageSize: data.pageSize ?? 12,
    });
  });

/**
 * Server Function for fetching product categories from Violet.
 *
 * ## Category fetching strategy (Task 6.7)
 *
 * 1. **Try** Violet's `GET /catalog/categories` endpoint for real categories
 * 2. **Fallback** to FALLBACK_CATEGORIES if the API returns empty, errors, or times out
 *
 * ## Why this is a "best effort" fetch
 *
 * Violet's category endpoint requires full authentication (JWT from `POST /login`).
 * The SupplierAdapter handles this token lifecycle for product searches, but doesn't
 * yet expose a `getCategories()` method (only `getProducts` and `getProduct` exist
 * from Story 3.1).
 *
 * Rather than duplicating the auth flow, we make an unauthenticated attempt with
 * app credentials only. If the sandbox requires full auth (likely), we gracefully
 * fall back. When a `getCategories()` method is added to the adapter (future story),
 * this function should be updated to use it.
 *
 * ## Why "All" is always first
 *
 * The "All" chip (filter=undefined) clears the category filter, showing all products.
 * This must always be present regardless of what the API returns, so we prepend it.
 *
 * @returns Array of CategoryItem — always non-empty (fallback guarantees this)
 * @see https://docs.violet.io/api-reference/catalog/categories/get-categories
 */
export const getCategoriesFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<CategoryItem[]> => {
    try {
      const apiBase = process.env.VIOLET_API_BASE ?? "https://sandbox-api.violet.io/v1";
      const appId = process.env.VIOLET_APP_ID;
      const appSecret = process.env.VIOLET_APP_SECRET;

      if (!appId || !appSecret) return FALLBACK_CATEGORIES;

      const response = await fetch(`${apiBase}/catalog/categories?page=1&size=20`, {
        headers: {
          "X-Violet-App-Id": appId,
          "X-Violet-App-Secret": appSecret,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(5_000),
      });

      if (!response.ok) return FALLBACK_CATEGORIES;

      const data = await response.json();
      const categories = data.content ?? [];

      /** Filter to top-level categories only (depth=0 or no parent) */
      const topLevel = categories.filter(
        (c: { parent_id?: string | null; depth?: number }) => !c.parent_id || c.depth === 0,
      );

      if (topLevel.length === 0) return FALLBACK_CATEGORIES;

      return [
        { slug: "all", label: "All", filter: undefined },
        ...topLevel.slice(0, 5).map((c: { name: string; slug?: string }) => ({
          slug: c.slug ?? c.name.toLowerCase().replace(/\s+/g, "-"),
          label: c.name,
          filter: c.name,
        })),
      ];
    } catch {
      /** Timeout, network error, or unexpected response — fall back silently */
      return FALLBACK_CATEGORIES;
    }
  },
);
