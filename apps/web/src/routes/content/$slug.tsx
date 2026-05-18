/**
 * /content/$slug route — Content detail page powered by Convex.
 *
 * Uses Convex useQuery for reactive data. SEO meta tags are generated
 * client-side via the head function (static fallbacks + dynamic from data).
 *
 * Migrated from Supabase server functions (Phase 11).
 * Same pattern as mobile `content/[slug].tsx`.
 */

import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { buildPageMeta, formatDate, CONTENT_TYPE_LABELS } from "@ecommerce/shared";
import type { ContentPage } from "@ecommerce/shared";
import { useQuery } from "convex/react";
import { api } from "#convex/_generated/api";
import MarkdownRenderer from "../../components/content/MarkdownRenderer";
import AffiliateDisclosure from "../../components/content/AffiliateDisclosure";
import RelatedContent from "../../components/content/RelatedContent";
import ShareButton from "../../components/ui/ShareButton";

const SITE_URL = process.env.SITE_URL ?? "http://localhost:3000";

export const Route = createFileRoute("/content/$slug")({
  component: ContentPageView,
  pendingComponent: ContentSkeleton,
  errorComponent: ContentError,
  head: ({ params }) => ({
    meta: buildPageMeta({
      title: `${params.slug} | Maison Émile`,
      description: "Editorial guides, comparisons, and reviews from Maison Émile.",
      url: `/content/${params.slug}`,
      siteUrl: SITE_URL,
    }),
  }),
});

function ContentPageView() {
  const { slug } = Route.useParams();
  const now = useMemo(() => Date.now(), []);
  const page = useQuery(api.content.queries.getContentPageBySlug, { slug, now });

  if (page === undefined) return <ContentSkeleton />;
  if (page === null) {
    return (
      <div className="page-wrap">
        <div className="content-page content-page--not-found">
          <h2>Content Not Found</h2>
          <p>The article you&apos;re looking for doesn&apos;t exist or has been removed.</p>
        </div>
      </div>
    );
  }

  const content: ContentPage = {
    id: page._id,
    slug: page.slug,
    title: page.title,
    type: page.type as ContentPage["type"],
    bodyMarkdown: page.bodyMarkdown,
    author: page.author,
    publishedAt: page.publishedAt ? new Date(page.publishedAt).toISOString() : null,
    seoTitle: page.seoTitle ?? null,
    seoDescription: page.seoDescription ?? null,
    featuredImageUrl: page.featuredImageUrl ?? null,
    status: page.status as ContentPage["status"],
    tags: page.tags ?? [],
    relatedSlugs: page.relatedSlugs ?? [],
    sortOrder: page.sortOrder,
    createdAt: new Date(page._creationTime).toISOString(),
    updatedAt: new Date(page._creationTime).toISOString(),
  };

  return (
    <div className="page-wrap">
      <article className="content-page">
        <header className="content-page__header">
          <span className="content-page__type-badge">
            {CONTENT_TYPE_LABELS[content.type] || content.type}
          </span>
          <h1 className="content-page__title">{content.title}</h1>
          <div className="content-page__meta">
            <span className="content-page__author">{content.author}</span>
            {content.publishedAt && (
              <>
                <span className="content-page__separator" aria-hidden="true">
                  ·
                </span>
                <time className="content-page__date" dateTime={content.publishedAt}>
                  {formatDate(content.publishedAt)}
                </time>
              </>
            )}
            <ShareButton
              url={`${SITE_URL}/content/${content.slug}`}
              title={content.seoTitle ?? content.title}
              text={
                content.seoDescription ??
                `${content.title} — ${CONTENT_TYPE_LABELS[content.type] || content.type}`
              }
              label={`Share "${content.title}"`}
              size="sm"
            />
          </div>
        </header>

        <AffiliateDisclosure />

        {content.featuredImageUrl && (
          <div className="content-page__hero">
            <img
              src={content.featuredImageUrl}
              alt={content.title}
              className="content-page__hero-image"
              loading="eager"
            />
          </div>
        )}

        <div className="content-page__body">
          <MarkdownRenderer content={content.bodyMarkdown} />
        </div>

        <RelatedContent slugs={content.relatedSlugs} />
      </article>
    </div>
  );
}

function ContentSkeleton() {
  return (
    <div className="page-wrap">
      <div className="content-page">
        <div className="content-page__header">
          <div className="skeleton skeleton--badge" />
          <div className="skeleton skeleton--title" />
          <div className="skeleton skeleton--meta" />
        </div>
        <div className="content-page__body">
          <div className="skeleton skeleton--paragraph" />
          <div className="skeleton skeleton--paragraph" />
          <div className="skeleton skeleton--paragraph skeleton--short" />
        </div>
      </div>
    </div>
  );
}

function ContentError() {
  return (
    <div className="page-wrap">
      <div className="content-page content-page--error">
        <h2>Something went wrong</h2>
        <p>We couldn&apos;t load this content. Please try again later.</p>
      </div>
    </div>
  );
}
