/**
 * @module LegalPageRoute
 *
 * Server-side rendered legal page (privacy, terms, cookies).
 *
 * Separate from /content/$slug because legal pages have different UX:
 * - No author byline, share button, or related content
 * - `noindex` meta tag (legal pages shouldn't appear in search results)
 * - Simpler, more formal visual treatment
 *
 * Content is stored as markdown in Supabase and rendered via MarkdownRenderer.
 * Breadcrumb JSON-LD structured data for search engine navigation display.
 */

import { createFileRoute } from "@tanstack/react-router";
import { buildPageMeta, formatDate, buildBreadcrumbJsonLd } from "@ecommerce/shared";
import { getLegalContentFn } from "../../server/getLegalContent";
import MarkdownRenderer from "../../components/content/MarkdownRenderer";

/** Valid legal page slugs — matches server-side validation in getLegalContent.ts. */
const VALID_LEGAL_SLUGS = new Set(["privacy", "terms", "cookies"]);

/** Human-readable titles for legal pages. */
const LEGAL_TITLES: Record<string, string> = {
  privacy: "Privacy Policy",
  terms: "Terms of Service",
  cookies: "Cookie Policy",
};

const SITE_URL = process.env.SITE_URL ?? "http://localhost:3000";

/**
 * /legal/$slug route — Server-side rendered legal page.
 *
 * Separate from /content/$slug because legal pages have different UX:
 * - No author byline, share button, or related content
 * - noindex meta tag (legal pages shouldn't appear in search results)
 * - Simpler, more formal visual treatment
 */
export const Route = createFileRoute("/legal/$slug")({
  loader: async ({ params: { slug } }) => {
    if (!VALID_LEGAL_SLUGS.has(slug)) {
      return { content: null };
    }
    const result = await getLegalContentFn({ data: slug });
    return { content: result.data ?? null };
  },
  pendingComponent: LegalSkeleton,
  component: LegalPageView,
  errorComponent: LegalError,
  head: ({ loaderData, params }) => {
    const content = loaderData?.content;
    const slug = params.slug;
    const fallbackTitle = LEGAL_TITLES[slug] ?? "Legal";
    const title = content?.seoTitle || `${fallbackTitle} | Maison Émile`;
    const description =
      content?.seoDescription || `${fallbackTitle} for Maison Émile curated shopping platform.`;
    const pageUrl = `${SITE_URL}/legal/${slug}`;

    return {
      meta: [
        ...buildPageMeta({
          title,
          description,
          url: pageUrl,
          siteUrl: SITE_URL,
        }),
        { name: "robots", content: "noindex, nofollow" },
      ],
      links: [{ rel: "canonical", href: pageUrl }],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify(
            buildBreadcrumbJsonLd([
              { name: "Home", url: SITE_URL },
              { name: fallbackTitle, url: pageUrl },
            ]),
          ),
        },
      ],
    };
  },
});

function LegalPageView() {
  const { content } = Route.useLoaderData();

  if (!content) {
    return (
      <div className="page-wrap">
        <div className="legal-page legal-page--not-found">
          <h2>Page Not Found</h2>
          <p>The legal page you&apos;re looking for doesn&apos;t exist.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-wrap">
      <article className="legal-page">
        <header className="legal-page__header">
          <h1 className="legal-page__title">{content.title}</h1>
          {content.updatedAt && (
            <p className="legal-page__updated">
              Last updated:{" "}
              <time dateTime={content.updatedAt}>{formatDate(content.updatedAt)}</time>
            </p>
          )}
        </header>

        <div className="legal-page__body">
          <MarkdownRenderer content={content.bodyMarkdown} />
        </div>
      </article>
    </div>
  );
}

function LegalSkeleton() {
  return (
    <div className="page-wrap">
      <div className="legal-page">
        <div className="legal-page__header">
          <div className="skeleton skeleton--title" />
          <div className="skeleton skeleton--meta" />
        </div>
        <div className="legal-page__body">
          <div className="skeleton skeleton--paragraph" />
          <div className="skeleton skeleton--paragraph" />
          <div className="skeleton skeleton--paragraph skeleton--short" />
        </div>
      </div>
    </div>
  );
}

function LegalError() {
  return (
    <div className="page-wrap">
      <div className="legal-page legal-page--error">
        <h2>Something went wrong</h2>
        <p>We couldn&apos;t load this page. Please try again later.</p>
      </div>
    </div>
  );
}
