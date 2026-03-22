/**
 * @module HelpPage
 *
 * Public FAQ & Help Center page with client-side search.
 *
 * SSR for SEO: FAQ items fetched server-side (Supabase RLS filters unpublished items).
 * Client-side debounced search filters questions and answers without server round-trips.
 * FAQPage JSON-LD structured data enables Google rich results.
 *
 * Accessibility features:
 * - `aria-live="polite"` region announces search result count to screen readers
 * - `aria-labelledby` on category sections for navigation
 * - Search input has `aria-label` for screen readers
 */

import { useState, useMemo, useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { buildPageMeta, buildBreadcrumbJsonLd, stripMarkdownSyntax } from "@ecommerce/shared";
import type { FaqItem } from "@ecommerce/shared";
import { getFaqItemsFn } from "../../server/getFaq";
import { filterFaq } from "../../utils/faqFilter";
import FaqAccordion from "../../components/help/FaqAccordion";
import FaqSearch from "../../components/help/FaqSearch";

const SITE_URL = process.env.SITE_URL ?? "http://localhost:3000";

/**
 * /help route — FAQ & Help Center page.
 *
 * SSR for SEO. FAQ items fetched via server function (Supabase RLS filters
 * unpublished items). Client-side search filters questions and answers.
 * FAQPage JSON-LD structured data enables Google rich results.
 */
export const Route = createFileRoute("/help/")({
  loader: async () => {
    const categories = await getFaqItemsFn();
    return { categories };
  },
  component: HelpPage,
  head: ({ loaderData }) => {
    const allItems = loaderData?.categories?.flatMap((c) => c.items) ?? [];
    return {
      meta: buildPageMeta({
        title: "Help Center — FAQ | Maison Émile",
        description:
          "Find answers to common questions about shipping, returns, payment methods, order tracking, and more.",
        url: "/help",
        siteUrl: SITE_URL,
      }),
      links: [{ rel: "canonical", href: `${SITE_URL}/help` }],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify(buildFaqJsonLd(allItems)),
        },
        {
          type: "application/ld+json",
          children: JSON.stringify(
            buildBreadcrumbJsonLd([
              { name: "Home", url: SITE_URL },
              { name: "Help Center", url: `${SITE_URL}/help` },
            ]),
          ),
        },
      ],
    };
  },
});

/** Build FAQPage schema.org structured data for Google rich results. */
function buildFaqJsonLd(items: FaqItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: stripMarkdownSyntax(item.answerMarkdown),
      },
    })),
  };
}

function HelpPage() {
  const { categories } = Route.useLoaderData();
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 200);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const { filtered, matchedIds } = useMemo(
    () => filterFaq(categories, debouncedQuery),
    [categories, debouncedQuery],
  );

  const filteredItems = useMemo(() => filtered.flatMap((c) => c.items), [filtered]);

  return (
    <div className="page-wrap faq-page">
      <header className="faq-page__header">
        <h1 className="display-title faq-page__title">Help Center</h1>
        <p className="faq-page__subtitle">
          Find answers to common questions about your orders and account.
        </p>
      </header>

      <FaqSearch value={searchQuery} onChange={setSearchQuery} />

      {/* aria-live region announces search result count to screen readers after debounced filtering */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {debouncedQuery &&
          `${filteredItems.length} résultat${filteredItems.length !== 1 ? "s" : ""} trouvé${filteredItems.length !== 1 ? "s" : ""}`}
      </div>

      {filtered.length === 0 ? (
        <div className="faq-page__empty">
          <p>No results found for &ldquo;{searchQuery}&rdquo;. Try a different search term.</p>
        </div>
      ) : (
        <div className="faq-page__categories">
          {filtered.map((category) => (
            <section
              key={category.name}
              aria-labelledby={`faq-cat-${category.name.replace(/\s+/g, "-").toLowerCase()}`}
            >
              <h2
                className="faq-page__category-title"
                id={`faq-cat-${category.name.replace(/\s+/g, "-").toLowerCase()}`}
              >
                {category.name}
              </h2>
              <FaqAccordion
                items={category.items}
                highlightedIds={searchQuery ? matchedIds : undefined}
              />
            </section>
          ))}
        </div>
      )}

      <div className="faq-page__contact-cta">
        <p>Can&apos;t find what you&apos;re looking for?</p>
        <Link to="/help/contact">Contact our support team</Link>
      </div>
    </div>
  );
}
