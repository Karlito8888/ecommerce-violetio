import { createFileRoute, Link } from "@tanstack/react-router";
import { buildPageMeta, buildWebSiteJsonLd, buildOrganizationJsonLd } from "@ecommerce/shared";
import SearchBar from "../components/search/SearchBar";
import RecentlyViewedRow from "../components/product/RecentlyViewedRow";

const SITE_URL = process.env.SITE_URL ?? "http://localhost:3000";

const POPULAR_CATEGORIES = [
  { slug: "fashion", label: "Fashion", filter: "Clothing" },
  { slug: "home", label: "Home & Living", filter: "Home" },
] as const;

/**
 * Homepage route — entry point for the platform.
 *
 * ## SEO (Story 3.8)
 *
 * - **WebSite JSON-LD** with SearchAction: tells Google this site has a search
 *   feature, enabling the sitelinks searchbox in SERPs.
 * - **Canonical**: Points to the bare SITE_URL (no trailing slash) — matches
 *   the sitemap `<loc>` and robots.txt domain.
 * - **Meta**: Full OG + Twitter Card set via `buildPageMeta()`.
 */
export const Route = createFileRoute("/")({
  component: App,
  head: () => ({
    meta: buildPageMeta({
      title: "Maison Émile — Curated Shopping",
      description:
        "Discover unique products from curated merchants — powered by AI search. Maison Émile brings you a handpicked shopping experience.",
      url: "/",
      siteUrl: SITE_URL,
    }),
    links: [{ rel: "canonical", href: SITE_URL }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify(buildWebSiteJsonLd(SITE_URL)),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify(buildOrganizationJsonLd(SITE_URL)),
      },
    ],
  }),
});

function App() {
  return (
    <section className="page-wrap" style={{ padding: "3.5rem 1rem 2rem" }}>
      <section className="island-shell hero rise-in">
        <div className="hero__glow hero__glow--top" />
        <div className="hero__glow hero__glow--bottom" />
        <p className="island-kicker hero__kicker">Curated Shopping, Reimagined</p>
        <h1 className="display-title hero__title">Find exactly what you&apos;re looking for.</h1>
        <p className="hero__desc">
          Discover unique products from curated merchants — powered by AI search.
        </p>
        <SearchBar variant="hero" />
        {/*
         * M2 code-review fix — use <Link> for SPA navigation.
         *
         * Raw <a href> causes a full page reload, discarding the React tree,
         * TanStack Query cache, and scroll position. <Link> from
         * @tanstack/react-router performs client-side navigation instead.
         */}
        <div className="hero__actions">
          <Link
            to="/products"
            search={{
              category: undefined,
              minPrice: undefined,
              maxPrice: undefined,
              inStock: undefined,
              sortBy: undefined,
              sortDirection: undefined,
            }}
            className="hero__btn hero__btn--primary"
          >
            Browse Products
          </Link>
          <Link to="/about" className="hero__btn hero__btn--secondary">
            About Us
          </Link>
        </div>
      </section>

      <RecentlyViewedRow />

      <section className="categories-teaser">
        <h2 className="island-kicker categories-teaser__kicker">Shop by Category</h2>
        <div className="categories-teaser__grid">
          {POPULAR_CATEGORIES.map((cat, index) => (
            <Link
              key={cat.slug}
              to="/products"
              search={{
                category: cat.filter,
                minPrice: undefined,
                maxPrice: undefined,
                inStock: undefined,
                sortBy: undefined,
                sortDirection: undefined,
              }}
              className="island-shell categories-teaser__card rise-in"
              style={{ animationDelay: `${index * 90 + 80}ms` }}
            >
              <span className="categories-teaser__label">{cat.label}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="features">
        {[
          [
            "AI-Powered Search",
            "Describe what you\u2019re looking for in your own words \u2014 our search understands intent, not just keywords.",
          ],
          [
            "Curated Merchants",
            "Every seller is handpicked for quality, authenticity, and reliability.",
          ],
          [
            "Unified Checkout",
            "One cart, multiple merchants \u2014 a single seamless checkout experience.",
          ],
          ["Secure Payments", "Stripe-powered payments with full buyer protection on every order."],
        ].map(([title, desc], index) => (
          <article
            key={title}
            className="island-shell features__card rise-in"
            style={{ animationDelay: `${index * 90 + 80}ms` }}
          >
            <h2 className="features__title">{title}</h2>
            <p className="features__desc">{desc}</p>
          </article>
        ))}
      </section>
    </section>
  );
}
