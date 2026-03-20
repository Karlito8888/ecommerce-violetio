import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { contentListQueryOptions, buildPageMeta, buildBreadcrumbJsonLd } from "@ecommerce/shared";
import type { ContentType, ContentListFetchFn } from "@ecommerce/shared";
import { getContentListFn } from "../../server/getContent";
import ContentListCard from "../../components/content/ContentListCard";
import ContentTypeFilter from "../../components/content/ContentTypeFilter";

/**
 * Adapts the TanStack Start server function to the shared ContentListFetchFn signature.
 */
const fetchContentList: ContentListFetchFn = (params) => getContentListFn({ data: params });

const SITE_URL = process.env.SITE_URL ?? "http://localhost:3000";

/** Valid content type values for URL search param validation. */
const VALID_CONTENT_TYPES = new Set<string>(["guide", "comparison", "review"]);

/** Search params for the /content route. */
export interface ContentSearchParams {
  type: ContentType | undefined;
}

/**
 * /content route — Server-side rendered content listing with type filtering.
 *
 * ## SSR Flow
 * 1. `validateSearch` parses `?type=guide` from URL
 * 2. `loaderDeps` extracts type as loader dependency
 * 3. `loader` calls `queryClient.ensureQueryData(contentListQueryOptions(...))` — prefetches page 1
 * 4. Component renders with `useSuspenseQuery(...)` — data already in cache
 *
 * ## "Load More" Flow
 * Unlike products (which use `useInfiniteQuery`), content listing uses
 * manual page state. Clicking "Load more" increments an internal page counter,
 * fetches the next page, and appends results to accumulated items.
 */
export const Route = createFileRoute("/content/")({
  validateSearch: (search: Record<string, unknown>): ContentSearchParams => {
    const typeRaw = String(search.type ?? "");
    return {
      type: VALID_CONTENT_TYPES.has(typeRaw) ? (typeRaw as ContentType) : undefined,
    };
  },
  loaderDeps: ({ search }) => search,
  loader: async ({ context: { queryClient }, deps }) => {
    const result = await queryClient.ensureQueryData(
      contentListQueryOptions({ type: deps.type, page: 1, limit: 12 }, fetchContentList),
    );
    return { initialData: result };
  },
  pendingComponent: ContentListPending,
  component: ContentListPage,
  errorComponent: ContentListError,
  head: () => ({
    meta: buildPageMeta({
      title: "Guides & Reviews | Maison Émile",
      description:
        "Browse curated editorial guides, in-depth comparisons, and honest reviews to make informed purchasing decisions.",
      url: "/content",
      siteUrl: SITE_URL,
    }),
    links: [{ rel: "canonical", href: `${SITE_URL}/content` }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: "Guides & Reviews",
          description: "Editorial guides, comparisons, and reviews from Maison Émile.",
          url: `${SITE_URL}/content`,
          publisher: {
            "@type": "Organization",
            name: "Maison Émile",
            url: SITE_URL,
          },
        }),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify(
          buildBreadcrumbJsonLd([
            { name: "Home", url: SITE_URL },
            { name: "Guides & Reviews", url: `${SITE_URL}/content` },
          ]),
        ),
      },
    ],
  }),
});

/** Pending state shown during route transitions (type filter changes). */
function ContentListPending() {
  return (
    <div className="page-wrap content-list">
      <h1 className="display-title content-list__title">Guides & Reviews</h1>
      <div className="content-list__skeleton-chips" aria-hidden="true">
        <div className="skeleton skeleton--text" style={{ width: "60%", height: "2rem" }} />
      </div>
      <div className="content-list__grid">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="content-list-card content-list-card--skeleton" aria-hidden="true">
            <div className="skeleton content-list-card__image" />
            <div className="content-list-card__body">
              <div className="skeleton skeleton--badge" />
              <div className="skeleton skeleton--title" />
              <div className="skeleton skeleton--paragraph" />
              <div className="skeleton skeleton--meta" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Content listing page component.
 *
 * Uses manual page accumulation: tracks `pages` state array, each "Load more"
 * click fetches the next page and appends to the array.
 *
 * **Caching (M2 fix):** "Load more" uses `queryClient.fetchQuery()` instead of
 * calling `fetchContentList()` directly. This ensures pages 2+ enter the
 * TanStack Query cache and survive component remounts (e.g. navigating to a
 * detail page and pressing back). Without this, accumulated pages were stored
 * only in React state and lost on remount.
 */
function ContentListPage() {
  const { type } = Route.useSearch();
  const navigate = Route.useNavigate();
  const queryClient = useQueryClient();

  // Fetch current page (page 1 is SSR-prefetched)
  const { data: firstPageResult } = useSuspenseQuery(
    contentListQueryOptions({ type, page: 1, limit: 12 }, fetchContentList),
  );

  const firstPage = firstPageResult.data;
  const [additionalPages, setAdditionalPages] = useState<(typeof firstPage)[]>([]);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState(false);

  // Reset additional pages when type filter changes
  const [prevType, setPrevType] = useState(type);
  if (type !== prevType) {
    setPrevType(type);
    setAdditionalPages([]);
  }

  const allItems = [...(firstPage?.items ?? []), ...additionalPages.flatMap((p) => p?.items ?? [])];
  const total = firstPage?.total ?? 0;
  const currentPage = 1 + additionalPages.length;
  const hasNext = firstPage?.hasNext ?? false;
  const hasMorePages =
    additionalPages.length > 0
      ? (additionalPages[additionalPages.length - 1]?.hasNext ?? false)
      : hasNext;

  const handleTypeChange = (newType: ContentType | undefined) => {
    navigate({ search: { type: newType } });
  };

  const handleLoadMore = async () => {
    setIsLoadingMore(true);
    setLoadMoreError(false);
    try {
      const nextPage = currentPage + 1;
      // Use queryClient.fetchQuery so the result enters the TanStack Query cache.
      // This means page 2+ data survives component remounts (e.g. back navigation).
      const result = await queryClient.fetchQuery(
        contentListQueryOptions({ type, page: nextPage, limit: 12 }, fetchContentList),
      );
      if (result.data) {
        setAdditionalPages((prev) => [...prev, result.data]);
      }
    } catch {
      setLoadMoreError(true);
    } finally {
      setIsLoadingMore(false);
    }
  };

  if (allItems.length === 0 && total === 0) {
    return (
      <div className="page-wrap content-list">
        <h1 className="display-title content-list__title">Guides & Reviews</h1>
        <ContentTypeFilter activeType={type} onTypeChange={handleTypeChange} />
        <div className="content-list__empty">
          <p>
            {type
              ? `No ${type === "guide" ? "guides" : type === "comparison" ? "comparisons" : "reviews"} available yet.`
              : "No content available yet."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-wrap content-list">
      <h1 className="display-title content-list__title">Guides & Reviews</h1>
      <p className="content-list__subtitle">
        Curated editorial content to help you make informed decisions.
      </p>

      <ContentTypeFilter activeType={type} onTypeChange={handleTypeChange} />

      <div className="content-list__toolbar">
        <div className="content-list__count" aria-live="polite">
          Showing {allItems.length} of {total} articles
        </div>
      </div>

      <div className="content-list__grid">
        {allItems.map((item) => (
          <ContentListCard key={item.id} content={item} />
        ))}
      </div>

      {hasMorePages && (
        <div className="content-list__pagination">
          <button
            type="button"
            className="content-list__load-more"
            onClick={handleLoadMore}
            disabled={isLoadingMore}
          >
            {isLoadingMore ? "Loading…" : "Load more"}
          </button>
          {loadMoreError && (
            <p className="content-list__load-more-error" role="alert">
              Failed to load more content. Please try again.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function ContentListError() {
  return (
    <div className="page-wrap content-list">
      <div className="content-list content-list--error">
        <h2>Something went wrong</h2>
        <p>We couldn&apos;t load the content listing. Please try again later.</p>
      </div>
    </div>
  );
}
