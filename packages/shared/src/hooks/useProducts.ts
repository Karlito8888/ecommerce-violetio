import { queryOptions, infiniteQueryOptions } from "@tanstack/react-query";
import type { ProductQuery, Product, PaginatedResult, ApiResponse } from "../types/index.js";
import { queryKeys } from "../utils/constants.js";

/**
 * Function signature for fetching products (list/search).
 *
 * Platform-specific implementations:
 * - **Web**: passes a TanStack Start Server Function (runs server-side, RPC from client)
 * - **Mobile**: will pass a Supabase Edge Function call (future story)
 *
 * This abstraction keeps the hook platform-agnostic while allowing each
 * platform to use its own secure data-fetching mechanism.
 */
export type ProductsFetchFn = (
  params: ProductQuery,
) => Promise<ApiResponse<PaginatedResult<Product>>>;

/**
 * Function signature for fetching a single product by ID.
 *
 * Same platform-agnostic pattern as {@link ProductsFetchFn}:
 * - **Web**: wraps `getProductFn` TanStack Start Server Function
 * - **Mobile**: will wrap a Supabase Edge Function call (future story)
 *
 * Returns `ApiResponse<Product>` — the discriminated union used across
 * the codebase, where `data` is the product and `error` signals a failure
 * (e.g., 404 "offer not found" from Violet API).
 *
 * @see https://docs.violet.io/api-reference/catalog/offers/get-offer-by-id
 */
export type ProductDetailFetchFn = (id: string) => Promise<ApiResponse<Product>>;

/**
 * Creates TanStack Query options for a **single page** of product results.
 *
 * Use this for one-off queries where infinite scrolling / "load more" is not needed.
 * For the product listing page with cumulative loading, use {@link productsInfiniteQueryOptions}.
 *
 * Returns a `queryOptions` object (not a hook) so it can be used in both:
 * - Route loaders for SSR prefetching (`context.queryClient.ensureQueryData(...)`)
 * - Components via `useQuery(productsQueryOptions(...))`
 *
 * Query key convention: `['products', 'list', { category, page, ... }]`
 * — defined in `queryKeys.products.list()` for cache consistency.
 *
 * @param params - Product query filters (category, page, pageSize, etc.)
 * @param fetchFn - Platform-specific fetch function (Server Function on web, Edge Function on mobile)
 *
 * @example
 * ```tsx
 * // In route loader (SSR)
 * await queryClient.ensureQueryData(productsQueryOptions(params, fetchFn))
 *
 * // In component
 * const { data } = useSuspenseQuery(productsQueryOptions(params, fetchFn))
 * ```
 *
 * @see https://tanstack.com/query/latest/docs/framework/react/guides/advanced-ssr
 */
export function productsQueryOptions(params: ProductQuery, fetchFn: ProductsFetchFn) {
  return queryOptions({
    queryKey: queryKeys.products.list(params),
    queryFn: () => fetchFn(params),
    /** 5 minutes — catalog data doesn't change frequently */
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Creates TanStack Query **infinite** options for cumulative "load more" product listing.
 *
 * ## Why infiniteQueryOptions instead of regular queryOptions?
 *
 * The product listing page uses a "Load more" button pattern (NOT pagination navigation).
 * Users expect to see **all previously loaded products** plus the new page — the list grows
 * from 12 → 24 → 36 products. Regular `queryOptions` would replace page 1 with page 2,
 * breaking the cumulative UX.
 *
 * `infiniteQueryOptions` manages an internal `pages[]` array where each element is one
 * page of results. TanStack Query handles:
 * - Accumulation of pages automatically (`data.pages`)
 * - `fetchNextPage()` to load the next page on demand
 * - `hasNextPage` derived from `getNextPageParam`
 * - Cache invalidation per query key (category change = fresh start)
 *
 * ## SSR Integration
 *
 * Used with `queryClient.ensureInfiniteQueryData(...)` in the route loader to prefetch
 * page 1 server-side. The dehydrated cache is sent to the client via
 * `setupRouterSsrQueryIntegration`, so the first render has data without a re-fetch.
 *
 * ## Query Key Strategy
 *
 * Uses `queryKeys.products.list(params)` where `params` omits `page` (since pages are
 * managed internally by the infinite query). This means `{ category: "Home" }` and
 * `{ category: "Home", page: 1 }` are DIFFERENT cache entries — infinite and single-page
 * queries don't collide.
 *
 * @param params - Product query filters WITHOUT `page` (page is managed by the infinite query)
 * @param fetchFn - Platform-specific fetch function
 *
 * @example
 * ```tsx
 * // In route loader (SSR — prefetches page 1)
 * await queryClient.ensureInfiniteQueryData(
 *   productsInfiniteQueryOptions({ category: "Home", pageSize: 12 }, fetchFn)
 * )
 *
 * // In component (cumulative "load more")
 * const { data, fetchNextPage, hasNextPage, isFetchingNextPage } =
 *   useSuspenseInfiniteQuery(productsInfiniteQueryOptions({ category }, fetchFn))
 *
 * const allProducts = data.pages.flatMap(p => p.data?.data ?? []);
 * ```
 *
 * @see https://tanstack.com/query/latest/docs/framework/react/guides/infinite-queries
 */
export function productsInfiniteQueryOptions(
  params: Omit<ProductQuery, "page">,
  fetchFn: ProductsFetchFn,
) {
  return infiniteQueryOptions({
    queryKey: queryKeys.products.list(params),
    queryFn: ({ pageParam }) =>
      fetchFn({ ...params, page: pageParam, pageSize: params.pageSize ?? 12 }),
    /**
     * Start from page 1 (our API is 1-based; the VioletAdapter converts to
     * Violet's 0-based pagination internally).
     */
    initialPageParam: 1,
    /**
     * Derive next page from the last fetched result.
     * Returns `undefined` when there are no more pages, which sets `hasNextPage = false`.
     */
    getNextPageParam: (lastPage) => {
      if (!lastPage.data || !lastPage.data.hasNext) return undefined;
      return lastPage.data.page + 1;
    },
    /** 5 minutes — catalog data doesn't change frequently */
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Creates TanStack Query options for a **single product** detail page.
 *
 * ## SSR Integration (Product Detail Page)
 *
 * Used with `queryClient.ensureQueryData(...)` in the route loader to prefetch
 * product data server-side. The dehydrated cache is sent to the client via
 * `setupRouterSsrQueryIntegration`, so the component renders with data immediately.
 *
 * ## Query Key Strategy
 *
 * Uses `queryKeys.products.detail(productId)` → `['products', 'detail', productId]`.
 * This is separate from list queries, so fetching a product detail never collides
 * with or invalidates the product listing cache.
 *
 * ## Violet API Mapping
 *
 * Maps to `GET /catalog/offers/{offer_id}` which returns the full Offer object
 * with variants[], skus[], albums[], and images[] — all data needed for the PDP.
 *
 * @param productId - Violet Offer ID (string)
 * @param fetchFn - Platform-specific fetch function (Server Function on web, Edge Function on mobile)
 *
 * @example
 * ```tsx
 * // In route loader (SSR prefetch)
 * await queryClient.ensureQueryData(productDetailQueryOptions(productId, fetchProduct))
 *
 * // In component (reads from cache, no re-fetch)
 * const { data } = useSuspenseQuery(productDetailQueryOptions(productId, fetchProduct))
 * ```
 *
 * @see https://docs.violet.io/api-reference/catalog/offers/get-offer-by-id
 * @see https://tanstack.com/query/latest/docs/framework/react/guides/advanced-ssr
 */
export function productDetailQueryOptions(productId: string, fetchFn: ProductDetailFetchFn) {
  return queryOptions({
    queryKey: queryKeys.products.detail(productId),
    queryFn: () => fetchFn(productId),
    /** 5 minutes — consistent with catalog data staleTime across all product queries */
    staleTime: 5 * 60 * 1000,
  });
}
