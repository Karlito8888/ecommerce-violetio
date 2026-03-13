import { useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { searchQueryOptions, useSearch, buildPageMeta } from "@ecommerce/shared";
import type { SearchFilters } from "@ecommerce/shared";
import { getSupabaseBrowserClient } from "../../utils/supabase";
import SearchBar from "../../components/search/SearchBar";
import SearchResults, { SearchResultsSkeleton } from "../../components/search/SearchResults";
import CategoryChips from "../../components/product/CategoryChips";
import FilterChips from "../../components/product/FilterChips";
import type { ActiveFilters } from "../../components/product/FilterChips";
import { getCategoriesFn } from "../../server/getProducts";

/**
 * URL search params for the `/search` route.
 *
 * All fields are optional — an empty `/search` page shows just the search bar
 * and is a valid entry point (e.g., from the mobile header search icon).
 *
 * Params are sanitised by `validateSearch` before reaching the component.
 */
export interface SearchPageParams {
  q: string | undefined;
  category: string | undefined;
  minPrice: number | undefined;
  maxPrice: number | undefined;
  inStock: boolean | undefined;
}

/** Safely coerce a URL search value to a finite number, or undefined. */
function parseNumericParam(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
}

const SITE_URL = process.env.SITE_URL ?? "http://localhost:3000";

/**
 * /search route — AI-powered product search.
 *
 * ## SEO (Story 3.8)
 *
 * - **noindex**: Search results pages are noindexed (`robots: noindex, follow`).
 *   Search URLs with query params (`/search?q=shoes`) would create near-infinite
 *   duplicate content if indexed. The `follow` directive still lets crawlers
 *   discover product links within search results.
 * - **Canonical**: Points to `/search` (no query params) — all search result
 *   variations share one canonical URL.
 * - **No JSON-LD**: Search results don't map to a schema.org type.
 *
 * Note: `head()` cannot access `search` params in TanStack Router v1.166.2,
 * so the title is static ("Search | Maison Émile") rather than dynamic
 * ("Results for 'shoes' | Maison Émile"). Story 7.3 may revisit this.
 */
export const Route = createFileRoute("/search/")({
  validateSearch: (search: Record<string, unknown>): SearchPageParams => ({
    q: typeof search.q === "string" && search.q.length > 0 ? search.q : undefined,
    category: typeof search.category === "string" ? search.category : undefined,
    minPrice: parseNumericParam(search.minPrice),
    maxPrice: parseNumericParam(search.maxPrice),
    inStock: search.inStock === "true" || search.inStock === true ? true : undefined,
  }),
  head: () => ({
    meta: buildPageMeta({
      title: "Search | Maison Émile",
      description: "Search for curated products at Maison Émile using AI-powered search.",
      url: "/search",
      siteUrl: SITE_URL,
      noindex: true,
    }),
    links: [{ rel: "canonical", href: `${SITE_URL}/search` }],
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ context: { queryClient }, deps }) => {
    const { q, category, minPrice, maxPrice, inStock } = deps;

    const filters: SearchFilters = {};
    if (category) filters.category = category;
    if (minPrice !== undefined) filters.minPrice = minPrice;
    if (maxPrice !== undefined) filters.maxPrice = maxPrice;
    if (inStock !== undefined) filters.inStock = inStock;

    /**
     * Epic 3 Review — Fix C2: SSR search prefetch wrapped in try/catch.
     *
     * `getSupabaseBrowserClient()` is designed for the browser — calling it in
     * the SSR loader creates a client without proper auth context. If the search
     * Edge Function is down or misconfigured, the unhandled rejection crashes
     * the entire page and shows the root error boundary instead of the graceful
     * error state in SearchResults.
     *
     * By catching the error here, we let the page render with empty search data.
     * The client-side `useSearch()` hook retries the query with a proper browser
     * client, and SearchResults handles loading/error/empty states gracefully.
     *
     * A future improvement would be to create a server-side Supabase client for
     * SSR prefetching, but for search results (which are highly dynamic and
     * user-specific), client-side fetching is acceptable.
     */
    let categories;
    try {
      const [, cats] = await Promise.all([
        q && q.length >= 2
          ? queryClient.ensureQueryData(
              searchQueryOptions({ query: q, filters }, getSupabaseBrowserClient()),
            )
          : Promise.resolve(null),
        getCategoriesFn(),
      ]);
      categories = cats;
    } catch {
      /** Search prefetch failed — page will render, useSearch() retries client-side */
      categories = (await getCategoriesFn().catch(() => null)) ?? [];
    }

    return { categories };
  },
  pendingComponent: SearchPagePending,
  component: SearchPage,
  errorComponent: SearchPageError,
});

/**
 * Epic 3 Review — Fix C2: Dedicated error boundary for the search route.
 *
 * Catches any unhandled error that escapes the loader try/catch (e.g., if
 * getCategoriesFn itself throws). Shows a user-friendly message with a
 * "Browse products" CTA instead of the generic root error boundary.
 *
 * The SearchResults component handles API-level errors (Edge Function failures).
 * This error component handles route-level errors (loader crashes, hydration errors).
 */
function SearchPageError() {
  return (
    <div className="page-wrap search-page">
      <div className="search-page__header">
        <h1 className="display-title search-page__title">Search</h1>
      </div>
      <div className="search-page__search-bar">
        <SearchBar variant="compact" />
      </div>
      <SearchResults
        products={[]}
        explanations={{}}
        query=""
        isLoading={false}
        error={new Error("Search is temporarily unavailable")}
      />
    </div>
  );
}

function SearchPagePending() {
  return (
    <div className="page-wrap search-page">
      <div className="search-page__header">
        <h1 className="display-title search-page__title">Search</h1>
      </div>
      <div className="search-page__skeleton-chips" aria-hidden="true">
        <div className="skeleton skeleton--text" style={{ width: "60%", height: "2rem" }} />
      </div>
      <SearchResultsSkeleton />
    </div>
  );
}

function SearchPage() {
  const { categories } = Route.useLoaderData();
  const { q, category, minPrice, maxPrice, inStock } = Route.useSearch();
  const navigate = Route.useNavigate();

  const supabase = getSupabaseBrowserClient();

  /**
   * M4 code-review fix — memoize filters object.
   *
   * Without useMemo, a new `filters` object is created on every render,
   * causing `useSearch` to receive a new reference each time. Since
   * TanStack Query uses the query key (which includes filters) for
   * identity, an unstable reference triggers unnecessary refetches.
   */
  const filters = useMemo<SearchFilters>(() => {
    const f: SearchFilters = {};
    if (category) f.category = category;
    if (minPrice !== undefined) f.minPrice = minPrice;
    if (maxPrice !== undefined) f.maxPrice = maxPrice;
    if (inStock !== undefined) f.inStock = inStock;
    return f;
  }, [category, minPrice, maxPrice, inStock]);

  const { data, isLoading, error } = useSearch({ query: q ?? "", filters }, supabase);

  /**
   * M3 code-review fix — preserve existing price/stock filters on category change.
   *
   * Previously, changing category would reset minPrice, maxPrice, and inStock
   * to undefined, causing the user to lose their filters. Now we keep them
   * so the user can refine by category without losing their price range.
   */
  const handleCategoryChange = (newCategory: string | undefined) => {
    navigate({
      search: {
        q,
        category: newCategory,
        minPrice,
        maxPrice,
        inStock,
      },
    });
  };

  const handleFilterChange = (newFilters: ActiveFilters) => {
    navigate({
      search: {
        q,
        category,
        minPrice: newFilters.minPrice,
        maxPrice: newFilters.maxPrice,
        inStock: newFilters.inStock,
      },
    });
  };

  const products = data?.products ?? [];
  const explanations = data?.explanations ?? {};
  const total = data?.total ?? 0;

  return (
    <div className="page-wrap search-page">
      <div className="search-page__header">
        {q ? (
          <>
            <p className="search-page__query">&ldquo;{q}&rdquo;</p>
            {total > 0 && (
              <p className="search-page__count" aria-live="polite">
                {total} product{total !== 1 ? "s" : ""} found
              </p>
            )}
          </>
        ) : (
          <h1 className="display-title search-page__title">Search</h1>
        )}
      </div>

      <div className="search-page__search-bar">
        {/* H2 fix — autoFocus so keyboard users can type immediately on /search */}
        <SearchBar variant="compact" initialQuery={q ?? ""} autoFocus />
      </div>

      {q && q.length >= 2 && (
        <div className="search-page__filters">
          <CategoryChips
            categories={categories}
            activeCategory={category}
            onCategoryChange={handleCategoryChange}
          />
          <FilterChips
            activeFilters={{ minPrice, maxPrice, inStock }}
            onFilterChange={handleFilterChange}
          />
        </div>
      )}

      <div className="search-page__results">
        <SearchResults
          products={products}
          explanations={explanations}
          query={q ?? ""}
          isLoading={isLoading}
          error={error}
        />
      </div>
    </div>
  );
}
