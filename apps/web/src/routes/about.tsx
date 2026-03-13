import { createFileRoute } from "@tanstack/react-router";
import { buildPageMeta } from "@ecommerce/shared";

const SITE_URL = process.env.SITE_URL ?? "http://localhost:3000";

/**
 * About page route.
 *
 * ## SEO (Story 3.8)
 *
 * Static page with no JSON-LD (no structured data needed for informational pages).
 * Canonical URL is `/about` — no query params to strip.
 */
export const Route = createFileRoute("/about")({
  component: About,
  head: () => ({
    meta: buildPageMeta({
      title: "About | Maison Émile",
      description:
        "Learn about Maison Émile — a curated shopping platform bringing you unique products from handpicked merchants.",
      url: "/about",
      siteUrl: SITE_URL,
    }),
    links: [{ rel: "canonical", href: `${SITE_URL}/about` }],
  }),
});

function About() {
  return (
    <section className="page-wrap about">
      <section className="island-shell about__section">
        <p className="island-kicker about__kicker">About</p>
        <h1 className="display-title about__title">A small starter with room to grow.</h1>
        <p className="about__text">
          TanStack Start gives you type-safe routing, server functions, and modern SSR defaults. Use
          this as a clean foundation, then layer in your own routes, styling, and add-ons.
        </p>
      </section>
    </section>
  );
}
