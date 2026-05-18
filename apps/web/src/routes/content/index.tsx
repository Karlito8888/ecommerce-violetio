/**
 * /content route — Content listing page powered by Convex.
 *
 * Uses Convex usePaginatedQuery for reactive paginated data.
 * Replaces TanStack Query + Supabase server function pattern.
 *
 * Migrated from Supabase server functions (Phase 11).
 * Same pattern as mobile `content/index.tsx`.
 */

import { useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { buildPageMeta, buildBreadcrumbJsonLd } from "@ecommerce/shared";
import type { ContentType } from "@ecommerce/shared";
import { usePaginatedQuery } from "convex/react";
import { api } from "#convex/_generated/api";
import ContentListCard from "../../components/content/ContentListCard";
import ContentTypeFilter from "../../components/content/ContentTypeFilter";

const SITE_URL = process.env.SITE_URL ?? "http://localhost:3000";
const VALID_CONTENT_TYPES = new Set<string>(["guide", "comparison", "review"]);

export interface ContentSearchParams {
  type: ContentType | undefined;
}

export const Route = createFileRoute("/content/")({
  validateSearch: (search: Record<string, unknown>): ContentSearchParams => {
    const typeRaw = String(search.type ?? "");
    return {
      type: VALID_CONTENT_TYPES.has(typeRaw) ? (typeRaw as ContentType) : undefined,
    };
  },
  component: ContentListPage,
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

function ContentListPage() {
  const { type } = Route.useSearch();
  const navigate = Route.useNavigate();
  const now = useMemo(() => Date.now(), []);

  const { results, loadMore, status } = usePaginatedQuery(
    api.content.queries.getContentPages,
    { type: type ?? undefined, now },
    { initialNumItems: 12 },
  );

  // Filter to non-legal types (Convex query excludes legal by default)
  const allItems = results
    .filter((page) => page.type !== "legal" && page.status === "published")
    .map((page) => ({
      id: page._id,
      slug: page.slug,
      title: page.title,
      type: page.type as ContentType,
      author: page.author,
      publishedAt: page.publishedAt ? new Date(page.publishedAt).toISOString() : null,
      seoDescription: page.seoDescription ?? null,
      featuredImageUrl: page.featuredImageUrl ?? null,
      status: page.status as "draft" | "published" | "archived",
      tags: page.tags ?? [],
      sortOrder: page.sortOrder,
      createdAt: new Date(page._creationTime).toISOString(),
      updatedAt: new Date(page._creationTime).toISOString(),
    }));

  const isLoadingMore = status === "LoadingMore";
  const canLoadMore = status === "CanLoadMore";

  const handleTypeChange = (newType: ContentType | undefined) => {
    navigate({ search: { type: newType } });
  };

  if (allItems.length === 0 && status !== "LoadingMore") {
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
          Showing {results.length} articles
        </div>
      </div>

      <div className="content-list__grid">
        {allItems.map((item) => (
          <ContentListCard key={item.id} content={item} />
        ))}
      </div>

      {canLoadMore && (
        <div className="content-list__pagination">
          <button
            type="button"
            className="content-list__load-more"
            onClick={() => loadMore(12)}
            disabled={isLoadingMore}
          >
            {isLoadingMore ? "Loading…" : "Load more"}
          </button>
        </div>
      )}
    </div>
  );
}
