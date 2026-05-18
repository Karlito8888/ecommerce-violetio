/**
 * /legal/$slug route — Legal page powered by Convex.
 *
 * Separate from /content/$slug because legal pages have different UX:
 * - No author byline, share button, or related content
 * - `noindex` meta tag
 * - Simpler, more formal visual treatment
 *
 * Migrated from Supabase server functions (Phase 11).
 */

import { createFileRoute } from "@tanstack/react-router";
import { buildPageMeta, formatDate, buildBreadcrumbJsonLd } from "@ecommerce/shared";
import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "#convex/_generated/api";
import MarkdownRenderer from "../../components/content/MarkdownRenderer";

const VALID_LEGAL_SLUGS = new Set(["privacy", "terms", "cookies"]);

const LEGAL_TITLES: Record<string, string> = {
  privacy: "Privacy Policy",
  terms: "Terms of Service",
  cookies: "Cookie Policy",
};

const SITE_URL = process.env.SITE_URL ?? "http://localhost:3000";

export const Route = createFileRoute("/legal/$slug")({
  component: LegalPageView,
  pendingComponent: LegalSkeleton,
  errorComponent: LegalError,
  head: ({ params }) => {
    const slug = params.slug;
    const fallbackTitle = LEGAL_TITLES[slug] ?? "Legal";
    return {
      meta: [
        ...buildPageMeta({
          title: `${fallbackTitle} | Maison Émile`,
          description: `${fallbackTitle} for Maison Émile curated shopping platform.`,
          url: `/legal/${slug}`,
          siteUrl: SITE_URL,
        }),
        { name: "robots", content: "noindex, nofollow" },
      ],
      links: [{ rel: "canonical", href: `${SITE_URL}/legal/${slug}` }],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify(
            buildBreadcrumbJsonLd([
              { name: "Home", url: SITE_URL },
              { name: fallbackTitle, url: `${SITE_URL}/legal/${slug}` },
            ]),
          ),
        },
      ],
    };
  },
});

function LegalPageView() {
  const { slug } = Route.useParams();
  const now = useMemo(() => Date.now(), []);

  const page = useQuery(
    api.content.queries.getContentPageBySlug,
    VALID_LEGAL_SLUGS.has(slug) ? { slug, now } : "skip",
  );

  if (page === undefined) return <LegalSkeleton />;
  if (page === null) {
    return (
      <div className="page-wrap">
        <div className="legal-page legal-page--not-found">
          <h2>Page Not Found</h2>
          <p>The legal page you&apos;re looking for doesn&apos;t exist.</p>
        </div>
      </div>
    );
  }

  const updatedAt = new Date(page._creationTime).toISOString();

  return (
    <div className="page-wrap">
      <article className="legal-page">
        <header className="legal-page__header">
          <h1 className="legal-page__title">{page.title}</h1>
          {updatedAt && (
            <p className="legal-page__updated">
              Last updated: <time dateTime={updatedAt}>{formatDate(updatedAt)}</time>
            </p>
          )}
        </header>

        <div className="legal-page__body">
          <MarkdownRenderer content={page.bodyMarkdown} />
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
