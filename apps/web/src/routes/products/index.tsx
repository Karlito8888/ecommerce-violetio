import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useSuspenseInfiniteQuery } from "@tanstack/react-query";
import { productsInfiniteQueryOptions } from "@ecommerce/shared";
import type { ProductsFetchFn } from "@ecommerce/shared";
import { getProductsFn, getCategoriesFn } from "../../server/getProducts";
import ProductGrid from "../../components/product/ProductGrid";
import ProductGridSkeleton from "../../components/product/ProductGridSkeleton";
import CategoryChips from "../../components/product/CategoryChips";

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
  validateSearch: (search: Record<string, unknown>) => ({
    category: (search.category as string) || undefined,
  }),
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
    const [, categories] = await Promise.all([
      queryClient.ensureInfiniteQueryData(
        productsInfiniteQueryOptions({ category: deps.category, pageSize: 12 }, fetchProducts),
      ),
      getCategoriesFn(),
    ]);

    return { categories };
  },
  /**
   * Shown during client-side navigation while the loader is fetching.
   * Uses the same grid skeleton as the loading state — skeleton screens,
   * NOT spinners (per AC 6 and UX spec).
   */
  pendingComponent: ProductListingPending,
  component: ProductListingPage,
});

/** Pending state shown during route transitions (category changes). */
function ProductListingPending() {
  return (
    <div className="page-wrap products-page">
      <h1 className="display-title products-page__title">Products</h1>
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
  const { category } = Route.useSearch();
  const navigate = useNavigate({ from: "/products/" });

  /**
   * Consume the infinite query that was prefetched in the loader.
   *
   * - `data.pages`: array of page results (each is `ApiResponse<PaginatedResult<Product>>`)
   * - `fetchNextPage()`: triggers fetch of next page, appends to `data.pages`
   * - `hasNextPage`: derived from `getNextPageParam` — false when last page reached
   * - `isFetchingNextPage`: true while "Load more" fetch is in progress
   */
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useSuspenseInfiniteQuery(
    productsInfiniteQueryOptions({ category, pageSize: 12 }, fetchProducts),
  );

  /**
   * Flatten all pages into a single product array for rendering.
   * Pages accumulate: page 1 = 12 items, after "Load more" = 24 items, etc.
   */
  const allProducts = data.pages.flatMap((page) => page.data?.data ?? []);
  const total = data.pages[0]?.data?.total ?? 0;

  const handleCategoryChange = (newCategory: string | undefined) => {
    /**
     * Category change navigates to a new URL, which triggers the route loader.
     * The infinite query for the new category starts fresh (page 1 only)
     * because the query key includes the category param.
     */
    navigate({
      search: { category: newCategory },
    });
  };

  if (allProducts.length === 0 && total === 0) {
    return (
      <div className="page-wrap products-page">
        <h1 className="display-title products-page__title">Products</h1>
        <CategoryChips
          categories={categories}
          activeCategory={category}
          onCategoryChange={handleCategoryChange}
        />
        <p className="products-page__empty">No products found in this category.</p>
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

      {/**
       * Live region: screen readers announce count changes when "Load more"
       * adds products. Shows cumulative count (not per-page).
       */}
      <div className="products-page__count" aria-live="polite">
        Showing {allProducts.length} of {total} products
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
