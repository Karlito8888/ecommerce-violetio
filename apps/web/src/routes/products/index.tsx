import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useSuspenseInfiniteQuery } from "@tanstack/react-query";
import {
  productsInfiniteQueryOptions,
  buildPageMeta,
  buildItemListJsonLd,
} from "@ecommerce/shared";
import type { ProductsFetchFn } from "@ecommerce/shared";
import { getProductsFn, getCategoriesFn } from "../../server/getProducts";
import ProductGrid from "../../components/product/ProductGrid";
import ProductGridSkeleton from "../../components/product/ProductGridSkeleton";
import CategoryChips from "../../components/product/CategoryChips";
import FilterChips from "../../components/product/FilterChips";
import type { ActiveFilters } from "../../components/product/FilterChips";
import SortSelect from "../../components/product/SortSelect";

/**
 * Typed search params for the /products route.
 *
 * All fields are optional — `undefined` means "no filter/sort applied".
 * TanStack Router uses this type for `navigate({ search })`, so it must
 * explicitly include `undefined` in union types to allow clearing params.
 */
export interface ProductSearchParams {
  category: string | undefined;
  minPrice: number | undefined;
  maxPrice: number | undefined;
  inStock: boolean | undefined;
  sortBy: "relevance" | "price" | undefined;
  sortDirection: "ASC" | "DESC" | undefined;
}

/** Allowed values for sortBy — validated at runtime, not just TypeScript cast. */
const VALID_SORT_BY = new Set<string>(["relevance", "price"]);

/** Allowed values for sortDirection. */
const VALID_SORT_DIRECTION = new Set<string>(["ASC", "DESC"]);

/**
 * Safely parse a URL search param to a finite number, or return `undefined`.
 *
 * ## Why not just `Number(value)`?
 *
 * `Number("abc")` returns `NaN`, which is truthy-ish in conditionals but
 * serializes to `null` in JSON (`JSON.stringify(NaN)` → `"null"`). If passed
 * to Violet's API as `min_price: null`, behavior is unpredictable.
 *
 * This helper returns `undefined` for any non-finite value (NaN, Infinity,
 * empty string, non-numeric strings), ensuring only valid integers reach
 * the API layer.
 *
 * @see https://docs.violet.io/api-reference/catalog/offers/search-offers — prices are integer cents
 */
function parseNumericParam(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
}

/**
 * Adapts the TanStack Start server function to the shared `ProductsFetchFn` signature.
 *
 * ## Why this wrapper exists
 *
 * The shared hook defines `ProductsFetchFn = (params: ProductQuery) => Promise<...>`
 * to stay platform-agnostic (web uses Server Functions, mobile will use Edge Functions).
 *
 * But TanStack Start's `createServerFn` expects calls in the form
 * `getProductsFn({ data: params })` — a convention specific to TanStack Start RPC.
 *
 * This one-liner bridges the two interfaces so the shared hook doesn't need to
 * know about TanStack Start's calling convention.
 */
const fetchProducts: ProductsFetchFn = (params) => getProductsFn({ data: params });

const SITE_URL = process.env.SITE_URL ?? "http://localhost:3000";

/**
 * /products route — Server-side rendered product listing with "Load more" pagination.
 *
 * ## SSR Flow (initial page load)
 *
 * 1. `validateSearch` parses `?category=X` from URL
 * 2. `loaderDeps` extracts category as loader dependency
 * 3. `loader` calls `queryClient.ensureInfiniteQueryData(...)` — prefetches page 1
 *    into TanStack Query cache (server-side)
 * 4. `setupRouterSsrQueryIntegration` dehydrates the cache into the HTML stream
 * 5. Component renders with `useSuspenseInfiniteQuery(...)` — data already in cache
 *
 * ## Client Navigation Flow (category change)
 *
 * 1. Category chip click → `navigate({ search: { category } })` updates URL
 * 2. `loaderDeps` detects category change → triggers loader
 * 3. Loader prefetches page 1 of new category
 * 4. `pendingComponent` shows skeleton while loading
 * 5. Component re-renders with new data
 *
 * ## "Load More" Flow (cumulative, NOT page navigation)
 *
 * 1. User clicks "Load more" → calls `fetchNextPage()` from TanStack Query
 * 2. `infiniteQueryOptions.getNextPageParam` computes the next page number
 * 3. New page fetched and **appended** to `data.pages[]` (products accumulate)
 * 4. UI shows 12 → 24 → 36 products (growing list)
 * 5. "Showing X of Y" count reflects total loaded, not single page
 *
 * ### Why NOT URL-based page navigation
 *
 * Original implementation used `?page=N` which replaced the entire product list
 * on each page change. This contradicts the "Load more" UX pattern where users
 * expect previously loaded products to remain visible. TanStack Query's
 * `useInfiniteQuery` manages page accumulation automatically.
 *
 * @see https://docs.violet.io/api-reference/catalog/offers/search-offers
 * @see https://tanstack.com/query/latest/docs/framework/react/guides/infinite-queries
 */
export const Route = createFileRoute("/products/")({
  /**
   * Parse and **validate** filter/sort state from URL query params.
   *
   * All filter state lives in the URL, making it shareable and bookmarkable.
   * Example: `?category=Home&minPrice=0&maxPrice=5000&inStock=true&sortBy=price&sortDirection=ASC`
   *
   * ## Validation strategy (defense-in-depth)
   *
   * - **Price params**: parsed via `parseNumericParam()` which rejects NaN/Infinity.
   *   `?minPrice=abc` → `undefined` (not NaN). Prevents sending `null` to Violet.
   * - **sortBy**: validated against `VALID_SORT_BY` allowlist. `?sortBy=hacked` → `undefined`.
   * - **sortDirection**: validated against `VALID_SORT_DIRECTION`. Invalid → `undefined`.
   * - **inStock**: only `"true"` or boolean `true` → `true`. Anything else → `undefined`.
   *
   * Price values are integer cents (matching Violet API convention).
   *
   * @see parseNumericParam — safe number parsing that rejects NaN
   * @see https://docs.violet.io/api-reference/catalog/offers/search-offers
   */
  validateSearch: (search: Record<string, unknown>): ProductSearchParams => {
    const sortByRaw = String(search.sortBy ?? "");
    const sortDirRaw = String(search.sortDirection ?? "");

    return {
      category: (search.category as string) || undefined,
      minPrice: parseNumericParam(search.minPrice),
      maxPrice: parseNumericParam(search.maxPrice),
      inStock: search.inStock === "true" || search.inStock === true ? true : undefined,
      sortBy: VALID_SORT_BY.has(sortByRaw) ? (sortByRaw as "relevance" | "price") : undefined,
      sortDirection: VALID_SORT_DIRECTION.has(sortDirRaw)
        ? (sortDirRaw as "ASC" | "DESC")
        : undefined,
    };
  },
  loaderDeps: ({ search }) => search,
  loader: async ({ context: { queryClient }, deps }) => {
    /**
     * Prefetch products (page 1) and categories in parallel.
     *
     * `ensureInfiniteQueryData` populates the TanStack Query cache server-side.
     * The dehydrated cache is sent to the client via `setupRouterSsrQueryIntegration`,
     * so `useSuspenseInfiniteQuery` in the component finds data without re-fetching.
     *
     * Categories are loaded separately via their own server function because
     * the VioletAdapter doesn't yet expose a `getCategories()` method.
     */
    /**
     * Prefetch products (page 1) and categories in parallel.
     *
     * We capture the infinite query result here (not just the side-effect)
     * so that `head()` can access the first page of products for ItemList
     * JSON-LD structured data (Story 3.8 — SEO foundation).
     */
    const [productsResult, categories] = await Promise.all([
      queryClient.ensureInfiniteQueryData(
        productsInfiniteQueryOptions(
          {
            category: deps.category,
            pageSize: 12,
            minPrice: deps.minPrice,
            maxPrice: deps.maxPrice,
            inStock: deps.inStock,
            sortBy: deps.sortBy,
            sortDirection: deps.sortDirection,
          },
          fetchProducts,
        ),
      ),
      getCategoriesFn(),
    ]);

    /** First page of products for head() JSON-LD (only need { id } per item). */
    const products = productsResult?.pages?.[0]?.data?.data ?? [];

    return { categories, products };
  },
  /**
   * Shown during client-side navigation while the loader is fetching.
   * Uses the same grid skeleton as the loading state — skeleton screens,
   * NOT spinners (per AC 6 and UX spec).
   */
  pendingComponent: ProductListingPending,
  component: ProductListingPage,
  /**
   * SEO head — product listing page (Story 3.8).
   *
   * Includes ItemList JSON-LD structured data (schema.org/ItemList) built from
   * the first page of products returned by the loader. This helps search engines
   * understand the listing as an ordered collection of products.
   *
   * Note: `loaderData.products` is the first page only (12 items). This is
   * intentional — JSON-LD should reflect the server-rendered content, not the
   * full paginated dataset (which requires JS "Load more" interaction).
   *
   * Canonical URL strips filter/sort params — `/products` is the single
   * canonical URL for the listing regardless of applied filters.
   */
  head: ({ loaderData }) => ({
    meta: buildPageMeta({
      title: "Products | Maison Émile",
      description: "Browse curated products from handpicked merchants at Maison Émile.",
      url: "/products",
      siteUrl: SITE_URL,
    }),
    links: [{ rel: "canonical", href: `${SITE_URL}/products` }],
    scripts:
      loaderData?.products && loaderData.products.length > 0
        ? [
            {
              type: "application/ld+json",
              children: JSON.stringify(buildItemListJsonLd(loaderData.products, SITE_URL)),
            },
          ]
        : [],
  }),
});

/** Pending state shown during route transitions (filter/sort/category changes). */
function ProductListingPending() {
  return (
    <div className="page-wrap products-page">
      <h1 className="display-title products-page__title">Products</h1>
      {/* Skeleton placeholders for category chips, filter chips, and toolbar */}
      <div className="products-page__skeleton-chips" aria-hidden="true">
        <div className="skeleton skeleton--text" style={{ width: "60%", height: "2rem" }} />
      </div>
      <div className="products-page__skeleton-chips" aria-hidden="true">
        <div className="skeleton skeleton--text" style={{ width: "80%", height: "2rem" }} />
      </div>
      <ProductGridSkeleton />
    </div>
  );
}

/**
 * Product listing page component.
 *
 * Uses `useSuspenseInfiniteQuery` to consume the prefetched data from the loader.
 * The infinite query manages page accumulation — each "Load more" click appends
 * a new page to the internal `data.pages[]` array.
 */
function ProductListingPage() {
  const { categories } = Route.useLoaderData();
  const { category, minPrice, maxPrice, inStock, sortBy, sortDirection } = Route.useSearch();
  const navigate = useNavigate({ from: "/products/" });

  /**
   * Consume the infinite query that was prefetched in the loader.
   *
   * All filter/sort params are included in the query options, which means:
   * - Query key changes when any filter changes → automatic cache invalidation
   * - Infinite query restarts from page 1 on filter change (new key = new query)
   * - Back/forward navigation restores filter state from URL
   */
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useSuspenseInfiniteQuery(
    productsInfiniteQueryOptions(
      { category, pageSize: 12, minPrice, maxPrice, inStock, sortBy, sortDirection },
      fetchProducts,
    ),
  );

  /**
   * Flatten all pages into a single product array for rendering.
   * Pages accumulate: page 1 = 12 items, after "Load more" = 24 items, etc.
   */
  const allProducts = data.pages.flatMap((page) => page.data?.data ?? []);
  const total = data.pages[0]?.data?.total ?? 0;

  /**
   * Category change resets all filters — navigates to a clean URL with only category.
   * This is intentional: switching categories should show unfiltered results.
   * All search params must be explicitly set (TanStack Router's typed search requires full object).
   */
  const handleCategoryChange = (newCategory: string | undefined) => {
    navigate({
      search: {
        category: newCategory,
        minPrice: undefined,
        maxPrice: undefined,
        inStock: undefined,
        sortBy: undefined,
        sortDirection: undefined,
      },
    });
  };

  /**
   * Filter chip change preserves category and sort, replaces price/availability filters.
   */
  const handleFilterChange = (filters: ActiveFilters) => {
    navigate({
      search: {
        category,
        minPrice: filters.minPrice,
        maxPrice: filters.maxPrice,
        inStock: filters.inStock,
        sortBy,
        sortDirection,
      },
    });
  };

  /**
   * Sort change preserves all other params (category, filters).
   *
   * ## Contract with SortSelect
   *
   * `SortSelect` calls `onSortChange(undefined, undefined)` for "Relevance"
   * (not `"relevance"` string) and `onSortChange("price", "ASC"|"DESC")` for
   * price sorting. We normalize: any non-"price" value clears sort from URL,
   * letting Violet return results in its default relevance order.
   *
   * @see SortSelect — sends `undefined` for relevance, `"price"` for price sort
   */
  const handleSortChange = (
    newSortBy: "relevance" | "price" | undefined,
    newSortDirection?: "ASC" | "DESC",
  ) => {
    const isPriceSort = newSortBy === "price";
    navigate({
      search: {
        category,
        minPrice,
        maxPrice,
        inStock,
        sortBy: isPriceSort ? "price" : undefined,
        sortDirection: isPriceSort ? newSortDirection : undefined,
      },
    });
  };

  const hasActiveFilters = minPrice !== undefined || maxPrice !== undefined || inStock === true;

  if (allProducts.length === 0 && total === 0) {
    return (
      <div className="page-wrap products-page">
        <h1 className="display-title products-page__title">Products</h1>
        <CategoryChips
          categories={categories}
          activeCategory={category}
          onCategoryChange={handleCategoryChange}
        />
        <FilterChips
          activeFilters={{ minPrice, maxPrice, inStock }}
          onFilterChange={handleFilterChange}
        />
        <div className="products-page__empty">
          <p>No products match your filters.</p>
          {hasActiveFilters && (
            <button
              type="button"
              className="products-page__clear-filters"
              onClick={() => handleFilterChange({})}
            >
              Clear filters
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="page-wrap products-page">
      <h1 className="display-title products-page__title">Products</h1>

      <CategoryChips
        categories={categories}
        activeCategory={category}
        onCategoryChange={handleCategoryChange}
      />

      <FilterChips
        activeFilters={{ minPrice, maxPrice, inStock }}
        onFilterChange={handleFilterChange}
      />

      {/**
       * Toolbar row: product count (left) + sort dropdown (right).
       * Count uses aria-live="polite" so screen readers announce filter changes.
       */}
      <div className="products-page__toolbar">
        <div className="products-page__count" aria-live="polite">
          Showing {allProducts.length} of {total} products
        </div>
        <SortSelect sortBy={sortBy} sortDirection={sortDirection} onSortChange={handleSortChange} />
      </div>

      <ProductGrid products={allProducts} />

      {hasNextPage && (
        <div className="products-page__pagination">
          <button
            type="button"
            className="products-page__load-more"
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
          >
            {isFetchingNextPage ? "Loading…" : "Load more"}
          </button>
        </div>
      )}
    </div>
  );
}
