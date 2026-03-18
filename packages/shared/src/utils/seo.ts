/**
 * Centralized SEO utilities — Story 3.8 (SEO Foundation).
 *
 * ## Architecture Decision
 *
 * All SEO metadata generation lives here in `@ecommerce/shared` (not in the
 * web app) because:
 *
 * 1. **Single source of truth**: Meta tags, JSON-LD schemas, and structured data
 *    are built from one place — no inline duplication across route files.
 * 2. **Testable**: Pure functions with no framework dependencies. Unit-tested
 *    independently from TanStack Start routing.
 * 3. **Reusable**: Future content pages (Epic 7) and potential SSG can reuse
 *    these utilities without importing from the web app.
 *
 * ## How it integrates with TanStack Start
 *
 * Each route's `head()` function calls `buildPageMeta()` for meta tags and
 * the appropriate `build*JsonLd()` for structured data. The root route
 * (`__root.tsx`) sets site-wide invariants (og:site_name, og:locale) while
 * child routes provide page-specific tags via these utilities.
 *
 * TanStack Start **merges** child head() with root head(). To prevent
 * duplication, og:type and twitter:card are generated here (per page),
 * NOT in the root. See `__root.tsx` for the complementary documentation.
 *
 * ## URL consistency
 *
 * All functions accept a `siteUrl` parameter. This MUST be set to
 * `https://www.maisonemile.com` in production (via `SITE_URL` env var).
 * The `www` prefix matters — it must match the canonical domain configured
 * in robots.txt and sitemap.xml to avoid duplicate-content signals.
 *
 * @module
 */

import type { Product } from "../types/product.types.js";
import { stripHtml } from "./stripHtml.js";

/* ─── Types ──────────────────────────────────────────────────────────── */

/** A single breadcrumb item for BreadcrumbList JSON-LD. */
export interface BreadcrumbItem {
  name: string;
  url: string;
}

/**
 * Meta tag entry for TanStack Start `head()`.
 *
 * Maps to `<meta>` and `<title>` HTML elements. TanStack Start's `HeadContent`
 * component renders these into the `<head>`. The `title` field is special —
 * it renders as `<title>` instead of `<meta>`.
 */
export interface MetaTag {
  title?: string;
  name?: string;
  property?: string;
  content?: string;
  charSet?: string;
}

/**
 * Options for `buildPageMeta()`.
 *
 * @param title - Page title (renders as `<title>` and og:title)
 * @param description - Page description (renders as `<meta name="description">` and og:description)
 * @param url - Page path (relative like "/products" or absolute). Relative paths
 *   are prefixed with `siteUrl` to create absolute URLs for og:url.
 * @param siteUrl - Base URL (e.g., "https://www.maisonemile.com"). Must include
 *   protocol and match the canonical domain.
 * @param image - Optional image URL for og:image and twitter:image
 * @param type - Open Graph type. Defaults to "website". Use "product" on PDPs.
 * @param noindex - When true, adds `<meta name="robots" content="noindex, follow">`.
 *   Used on auth, search, and transactional pages to prevent indexing.
 */
export interface PageMetaOptions {
  title: string;
  description: string;
  url: string;
  siteUrl: string;
  image?: string;
  type?: "website" | "product" | "article";
  noindex?: boolean;
}

/* ─── Meta Tag Builder ───────────────────────────────────────────────── */

/**
 * Generate a complete meta tag array for TanStack Start's `head()`.
 *
 * Produces: title, description, Open Graph (og:title, og:description, og:image,
 * og:type, og:url), Twitter Card (summary_large_image), and optional robots noindex.
 *
 * @see https://ogp.me/ — Open Graph protocol
 * @see https://developer.twitter.com/en/docs/twitter-for-websites/cards
 */
export function buildPageMeta(options: PageMetaOptions): MetaTag[] {
  const { title, description, url, siteUrl, image, type = "website", noindex } = options;
  const absoluteUrl = url.startsWith("http") ? url : `${siteUrl}${url}`;

  const meta: MetaTag[] = [
    { title },
    { name: "description", content: description },
    // Open Graph
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:type", content: type },
    { property: "og:url", content: absoluteUrl },
    // Twitter Card
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
  ];

  if (image) {
    meta.push({ property: "og:image", content: image });
    meta.push({ name: "twitter:image", content: image });
  }

  if (noindex) {
    meta.push({ name: "robots", content: "noindex, follow" });
  }

  return meta;
}

/* ─── JSON-LD Builders ───────────────────────────────────────────────── */

/**
 * Build JSON-LD structured data for a Product (schema.org).
 *
 * Moved from `apps/web/src/routes/products/$productId.tsx` — logic preserved.
 *
 * Uses AggregateOffer when minPrice !== maxPrice (price range),
 * otherwise a single Offer. Prices converted from integer cents to decimal.
 *
 * @see https://schema.org/Product
 * @see https://developers.google.com/search/docs/appearance/structured-data/product
 */
export function buildProductJsonLd(product: Product, siteUrl: string): object {
  const hasPriceRange = product.minPrice !== product.maxPrice;

  const offers = hasPriceRange
    ? {
        "@type": "AggregateOffer",
        lowPrice: (product.minPrice / 100).toFixed(2),
        highPrice: (product.maxPrice / 100).toFixed(2),
        priceCurrency: product.currency,
        availability: product.available
          ? "https://schema.org/InStock"
          : "https://schema.org/OutOfStock",
        seller: { "@type": "Organization", name: product.seller },
      }
    : {
        "@type": "Offer",
        price: (product.minPrice / 100).toFixed(2),
        priceCurrency: product.currency,
        availability: product.available
          ? "https://schema.org/InStock"
          : "https://schema.org/OutOfStock",
        seller: { "@type": "Organization", name: product.seller },
      };

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: stripHtml(product.htmlDescription ?? product.description).slice(0, 5000),
    image: product.thumbnailUrl ?? undefined,
    url: `${siteUrl}/products/${product.id}`,
    brand: { "@type": "Brand", name: product.vendor },
    offers,
  };
}

/**
 * Build JSON-LD ItemList schema for product listing pages.
 *
 * Each product becomes a ListItem with position and URL. Used in the
 * `/products` route's `head()` to tell search engines that this page
 * is an ordered collection of products.
 *
 * Only the first page of products is included (what the server renders).
 * Subsequent "Load more" pages are client-side only and not in the JSON-LD.
 * This is intentional — structured data should match server-rendered content.
 *
 * @param products - Array of objects with at least an `id` field (product ID).
 *   Accepts the full Product type but only uses `id` for URL construction.
 * @param siteUrl - Base URL for building absolute product URLs
 *
 * @see https://schema.org/ItemList
 * @see apps/web/src/routes/products/index.tsx — consumer of this function
 */
export function buildItemListJsonLd(products: { id: string }[], siteUrl: string): object {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: products.map((p, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `${siteUrl}/products/${p.id}`,
    })),
  };
}

/**
 * Build JSON-LD WebSite schema for the homepage (with SearchAction).
 *
 * @see https://schema.org/WebSite
 * @see https://developers.google.com/search/docs/appearance/structured-data/sitelinks-searchbox
 */
export function buildWebSiteJsonLd(siteUrl: string): object {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Maison Émile",
    url: siteUrl,
    potentialAction: {
      "@type": "SearchAction",
      target: `${siteUrl}/search?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };
}

/**
 * Build JSON-LD BreadcrumbList schema for navigation breadcrumbs.
 *
 * Each item becomes a ListItem with position (1-indexed) and URL.
 * Used on product, content, and listing pages to help search engines
 * understand the site hierarchy.
 *
 * @param items - Ordered breadcrumb items from root (Home) to current page
 * @see https://schema.org/BreadcrumbList
 * @see https://developers.google.com/search/docs/appearance/structured-data/breadcrumb
 */
export function buildBreadcrumbJsonLd(items: BreadcrumbItem[]): object {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

/**
 * Build JSON-LD Organization schema for the homepage.
 *
 * Provides search engines with business identity information.
 * Typically placed on the homepage alongside WebSite schema.
 *
 * @param siteUrl - Base URL for the organization
 * @see https://schema.org/Organization
 * @see https://developers.google.com/search/docs/appearance/structured-data/organization
 */
export function buildOrganizationJsonLd(siteUrl: string): object {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Maison Émile",
    url: siteUrl,
    logo: `${siteUrl}/logo.png`,
  };
}

/**
 * Count words in a text string, stripping Markdown syntax first.
 *
 * Used to populate the `wordCount` property in Article JSON-LD.
 *
 * @param text - Raw text or Markdown content
 * @returns Number of words
 */
export function wordCount(text: string): number {
  const stripped = text
    .replace(/\{\{product:[^}]+\}\}/g, "") // Remove product embeds
    .replace(/```[\s\S]*?```/g, "") // Remove code blocks (before inline code)
    .replace(/#{1,6}\s/g, "") // Remove heading markers
    .replace(/\*\*([^*]+)\*\*/g, "$1") // Bold to plain
    .replace(/\*([^*]+)\*/g, "$1") // Italic to plain
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // Links to text
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "") // Remove images
    .replace(/`([^`]+)`/g, "$1") // Inline code to plain
    .trim();

  if (stripped.length === 0) return 0;
  return stripped.split(/\s+/).length;
}
