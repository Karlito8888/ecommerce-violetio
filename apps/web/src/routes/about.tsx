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
        "Maison Émile curates handpicked merchants and AI-powered search for a seamless multi-merchant shopping experience.",
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
        <p className="island-kicker about__kicker">Our Story</p>
        <h1 className="display-title about__title">Curated shopping, powered by people and AI.</h1>
        <p className="about__text">
          Maison Émile brings together handpicked merchants who share our commitment to quality and
          authenticity. Every product in our catalog has been curated — not by algorithms alone, but
          by people who care about what they recommend.
        </p>
        <p className="about__text">
          Powered by AI-driven search and a seamless multi-merchant checkout, we make it effortless
          to discover and purchase from the best independent sellers — all in one place, with full
          buyer protection on every order.
        </p>
      </section>
    </section>
  );
}
