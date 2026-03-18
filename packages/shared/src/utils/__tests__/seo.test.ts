import { describe, it, expect } from "vitest";
import {
  buildPageMeta,
  buildProductJsonLd,
  buildItemListJsonLd,
  buildWebSiteJsonLd,
  buildBreadcrumbJsonLd,
  buildOrganizationJsonLd,
  wordCount,
} from "../seo.js";
import type { Product } from "../../types/product.types.js";

const SITE_URL = "https://maisonemile.com";

/* ─── buildPageMeta ──────────────────────────────────────────────────── */

describe("buildPageMeta", () => {
  it("generates title, description, OG, and Twitter meta tags", () => {
    const meta = buildPageMeta({
      title: "Test Page",
      description: "A test description",
      url: "/test",
      siteUrl: SITE_URL,
    });

    expect(meta).toContainEqual({ title: "Test Page" });
    expect(meta).toContainEqual({ name: "description", content: "A test description" });
    expect(meta).toContainEqual({ property: "og:title", content: "Test Page" });
    expect(meta).toContainEqual({ property: "og:description", content: "A test description" });
    expect(meta).toContainEqual({ property: "og:url", content: `${SITE_URL}/test` });
    expect(meta).toContainEqual({ property: "og:type", content: "website" });
    expect(meta).toContainEqual({ name: "twitter:card", content: "summary_large_image" });
  });

  it("includes image tags when image is provided", () => {
    const meta = buildPageMeta({
      title: "T",
      description: "D",
      url: "/x",
      siteUrl: SITE_URL,
      image: "https://img.example.com/photo.jpg",
    });

    expect(meta).toContainEqual({
      property: "og:image",
      content: "https://img.example.com/photo.jpg",
    });
    expect(meta).toContainEqual({
      name: "twitter:image",
      content: "https://img.example.com/photo.jpg",
    });
  });

  it("does not include image tags when image is omitted", () => {
    const meta = buildPageMeta({ title: "T", description: "D", url: "/x", siteUrl: SITE_URL });
    expect(meta.find((m) => m.property === "og:image")).toBeUndefined();
  });

  it("adds noindex robots tag when noindex is true", () => {
    const meta = buildPageMeta({
      title: "T",
      description: "D",
      url: "/x",
      siteUrl: SITE_URL,
      noindex: true,
    });
    expect(meta).toContainEqual({ name: "robots", content: "noindex, follow" });
  });

  it("does not add robots tag when noindex is false/omitted", () => {
    const meta = buildPageMeta({ title: "T", description: "D", url: "/x", siteUrl: SITE_URL });
    expect(meta.find((m) => m.name === "robots")).toBeUndefined();
  });

  it("uses absolute URL when url already starts with http", () => {
    const meta = buildPageMeta({
      title: "T",
      description: "D",
      url: "https://other.com/page",
      siteUrl: SITE_URL,
    });
    expect(meta).toContainEqual({ property: "og:url", content: "https://other.com/page" });
  });
});

/* ─── buildProductJsonLd ─────────────────────────────────────────────── */

const baseProduct: Product = {
  id: "prod-123",
  name: "Test Widget",
  description: "A plain text description",
  htmlDescription: "<p>An <b>HTML</b> description</p>",
  thumbnailUrl: "https://img.example.com/widget.jpg",
  minPrice: 1999,
  maxPrice: 1999,
  currency: "USD",
  available: true,
  seller: "Test Store",
  vendor: "Widget Co",
  variants: [],
};

describe("buildProductJsonLd", () => {
  it("uses Offer when minPrice === maxPrice", () => {
    const ld = buildProductJsonLd(baseProduct, SITE_URL) as Record<string, unknown>;
    const offers = ld.offers as Record<string, unknown>;
    expect(offers["@type"]).toBe("Offer");
    expect(offers.price).toBe("19.99");
    expect(offers.priceCurrency).toBe("USD");
  });

  it("uses AggregateOffer when minPrice !== maxPrice", () => {
    const product = { ...baseProduct, maxPrice: 4999 };
    const ld = buildProductJsonLd(product, SITE_URL) as Record<string, unknown>;
    const offers = ld.offers as Record<string, unknown>;
    expect(offers["@type"]).toBe("AggregateOffer");
    expect(offers.lowPrice).toBe("19.99");
    expect(offers.highPrice).toBe("49.99");
  });

  it("strips HTML from description", () => {
    const ld = buildProductJsonLd(baseProduct, SITE_URL) as Record<string, unknown>;
    expect(ld.description).not.toContain("<p>");
    expect(ld.description).not.toContain("<b>");
  });

  it("includes product URL with siteUrl", () => {
    const ld = buildProductJsonLd(baseProduct, SITE_URL) as Record<string, unknown>;
    expect(ld.url).toBe(`${SITE_URL}/products/prod-123`);
  });
});

/* ─── buildItemListJsonLd ────────────────────────────────────────────── */

describe("buildItemListJsonLd", () => {
  it("creates ListItem entries with correct positions", () => {
    const products = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const ld = buildItemListJsonLd(products, SITE_URL) as Record<string, unknown>;
    const items = ld.itemListElement as Array<Record<string, unknown>>;
    expect(items).toHaveLength(3);
    expect(items[0].position).toBe(1);
    expect(items[0].url).toBe(`${SITE_URL}/products/a`);
    expect(items[2].position).toBe(3);
  });
});

/* ─── buildWebSiteJsonLd ─────────────────────────────────────────────── */

describe("buildWebSiteJsonLd", () => {
  it("includes SearchAction with correct target", () => {
    const ld = buildWebSiteJsonLd(SITE_URL) as Record<string, unknown>;
    expect(ld["@type"]).toBe("WebSite");
    expect(ld.name).toBe("Maison Émile");
    const action = ld.potentialAction as Record<string, unknown>;
    expect(action["@type"]).toBe("SearchAction");
    expect(action.target).toContain("/search?q=");
  });
});

/* ─── buildBreadcrumbJsonLd ────────────────────────────────────────── */

describe("buildBreadcrumbJsonLd", () => {
  it("creates BreadcrumbList with correct positions (1-indexed)", () => {
    const ld = buildBreadcrumbJsonLd([
      { name: "Home", url: SITE_URL },
      { name: "Products", url: `${SITE_URL}/products` },
      { name: "Widget", url: `${SITE_URL}/products/123` },
    ]) as Record<string, unknown>;

    expect(ld["@context"]).toBe("https://schema.org");
    expect(ld["@type"]).toBe("BreadcrumbList");

    const items = ld.itemListElement as Array<Record<string, unknown>>;
    expect(items).toHaveLength(3);
    expect(items[0]).toEqual({
      "@type": "ListItem",
      position: 1,
      name: "Home",
      item: SITE_URL,
    });
    expect(items[1].position).toBe(2);
    expect(items[1].name).toBe("Products");
    expect(items[2].position).toBe(3);
    expect(items[2].name).toBe("Widget");
  });

  it("handles single item breadcrumb", () => {
    const ld = buildBreadcrumbJsonLd([{ name: "Home", url: SITE_URL }]) as Record<string, unknown>;

    const items = ld.itemListElement as Array<Record<string, unknown>>;
    expect(items).toHaveLength(1);
    expect(items[0].position).toBe(1);
  });
});

/* ─── buildOrganizationJsonLd ──────────────────────────────────────── */

describe("buildOrganizationJsonLd", () => {
  it("creates Organization schema with name, url, and logo", () => {
    const ld = buildOrganizationJsonLd(SITE_URL) as Record<string, unknown>;
    expect(ld["@context"]).toBe("https://schema.org");
    expect(ld["@type"]).toBe("Organization");
    expect(ld.name).toBe("Maison Émile");
    expect(ld.url).toBe(SITE_URL);
    expect(ld.logo).toBe(`${SITE_URL}/logo.png`);
  });
});

/* ─── wordCount ────────────────────────────────────────────────────── */

describe("wordCount", () => {
  it("counts words in plain text", () => {
    expect(wordCount("hello world foo bar")).toBe(4);
  });

  it("counts words after stripping Markdown syntax", () => {
    expect(wordCount("## Heading\n\n**bold text** and *italic text*")).toBe(6);
  });

  it("removes product embeds before counting", () => {
    expect(wordCount("Buy this {{product:abc123}} now")).toBe(3);
  });

  it("returns 0 for empty string", () => {
    expect(wordCount("")).toBe(0);
  });

  it("returns 0 for whitespace-only string", () => {
    expect(wordCount("   \n\t  ")).toBe(0);
  });
});
