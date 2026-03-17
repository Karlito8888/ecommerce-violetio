import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { contentDetailQueryOptions, buildPageMeta, formatDate } from "@ecommerce/shared";
import type { ContentDetailFetchFn, ContentPage } from "@ecommerce/shared";
import { getContentBySlugFn } from "../../server/getContent";
import MarkdownRenderer from "../../components/content/MarkdownRenderer";
import AffiliateDisclosure from "../../components/content/AffiliateDisclosure";

/**
 * Adapts the TanStack Start server function to the shared ContentDetailFetchFn signature.
 */
const fetchContent: ContentDetailFetchFn = (slug) => getContentBySlugFn({ data: slug });

const SITE_URL = process.env.SITE_URL ?? "http://localhost:3000";

/** Content type label mapping for display badges. */
const TYPE_LABELS: Record<string, string> = {
  guide: "Guide",
  comparison: "Comparison",
  review: "Review",
};

/**
 * /content/$slug route — Server-side rendered Editorial Content Page.
 *
 * ## SSR Flow
 * 1. `loader` extracts `slug` from route params
 * 2. `queryClient.ensureQueryData(contentDetailQueryOptions(...))` prefetches
 *    content data into TanStack Query cache (server-side)
 * 3. Component renders with `useSuspenseQuery(...)` — data already in cache
 *
 * ## SEO (FR34)
 * The `head` function generates dynamic <title>, <meta description>,
 * Open Graph tags, and JSON-LD Article structured data.
 */
export const Route = createFileRoute("/content/$slug")({
  loader: async ({ context: { queryClient }, params: { slug } }) => {
    const result = await queryClient.ensureQueryData(contentDetailQueryOptions(slug, fetchContent));
    return { content: result.data ?? null };
  },
  pendingComponent: ContentSkeleton,
  component: ContentPageView,
  errorComponent: ContentError,
  head: ({ loaderData }) => {
    const content = loaderData?.content;
    if (!content) {
      return { meta: [{ title: "Content Not Found | Maison Émile" }] };
    }

    const title = content.seoTitle || `${content.title} | Maison Émile`;
    const description =
      content.seoDescription || content.bodyMarkdown.replace(/[#*_[\]]/g, "").slice(0, 160);
    const contentUrl = `${SITE_URL}/content/${content.slug}`;

    return {
      meta: buildPageMeta({
        title,
        description,
        url: contentUrl,
        siteUrl: SITE_URL,
        image: content.featuredImageUrl ?? undefined,
        type: "article",
      }),
      links: [{ rel: "canonical", href: contentUrl }],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify(buildArticleJsonLd(content, SITE_URL)),
        },
      ],
    };
  },
});

/**
 * Build JSON-LD Article structured data for content pages.
 * @see https://schema.org/Article
 */
function buildArticleJsonLd(content: ContentPage, siteUrl: string): object {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: content.title,
    author: { "@type": "Person", name: content.author },
    datePublished: content.publishedAt,
    dateModified: content.updatedAt,
    image: content.featuredImageUrl ?? undefined,
    url: `${siteUrl}/content/${content.slug}`,
    publisher: {
      "@type": "Organization",
      name: "Maison Émile",
      url: siteUrl,
    },
  };
}

/**
 * Content Page component — renders the full editorial content page.
 */
function ContentPageView() {
  const { slug } = Route.useParams();
  const { data } = useSuspenseQuery(contentDetailQueryOptions(slug, fetchContent));

  if (!data.data) {
    return (
      <div className="page-wrap">
        <div className="content-page content-page--not-found">
          <h2>Content Not Found</h2>
          <p>The article you&apos;re looking for doesn&apos;t exist or has been removed.</p>
        </div>
      </div>
    );
  }

  const content = data.data;

  return (
    <div className="page-wrap">
      <article className="content-page">
        <header className="content-page__header">
          <span className="content-page__type-badge">
            {TYPE_LABELS[content.type] || content.type}
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
