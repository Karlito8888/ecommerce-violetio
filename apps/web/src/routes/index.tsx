import { createFileRoute, Link } from "@tanstack/react-router";
import { buildPageMeta, buildWebSiteJsonLd } from "@ecommerce/shared";
import SearchBar from "../components/search/SearchBar";
import RecentlyViewedRow from "../components/product/RecentlyViewedRow";

const SITE_URL = process.env.SITE_URL ?? "http://localhost:3000";

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

      <section className="features">
        {[
          ["Type-Safe Routing", "Routes and links stay in sync across every page."],
          ["Server Functions", "Call server code from your UI without creating API boilerplate."],
          ["Streaming by Default", "Ship progressively rendered responses for faster experiences."],
          ["Vanilla CSS", "Design with custom properties and BEM — no framework needed."],
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

      <section className="island-shell quick-start">
        <p className="island-kicker quick-start__kicker">Quick Start</p>
        <ul className="quick-start__list">
          <li>
            Edit <code>src/routes/index.tsx</code> to customize the home page.
          </li>
          <li>
            Update <code>src/components/Header.tsx</code> and <code>src/components/Footer.tsx</code>{" "}
            for brand links.
          </li>
          <li>
            Add routes in <code>src/routes</code> and tweak visual tokens in{" "}
            <code>src/styles.css</code>.
          </li>
        </ul>
      </section>
    </section>
  );
}
