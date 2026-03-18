import { describe, it, expect } from "vitest";
import { buildBreadcrumbJsonLd, buildOrganizationJsonLd, wordCount } from "@ecommerce/shared";

const SITE_URL = "https://maisonemile.com";

/* ─── buildBreadcrumbJsonLd (route integration) ────────────────────── */

describe("BreadcrumbList JSON-LD for routes", () => {
  it("generates correct breadcrumb for product detail page", () => {
    const ld = buildBreadcrumbJsonLd([
      { name: "Home", url: SITE_URL },
      { name: "Products", url: `${SITE_URL}/products` },
      { name: "Silk Scarf", url: `${SITE_URL}/products/prod-456` },
    ]) as Record<string, unknown>;

    expect(ld["@type"]).toBe("BreadcrumbList");
    const items = ld.itemListElement as Array<Record<string, unknown>>;
    expect(items).toHaveLength(3);
    expect(items[0].name).toBe("Home");
    expect(items[0].item).toBe(SITE_URL);
    expect(items[1].name).toBe("Products");
    expect(items[2].name).toBe("Silk Scarf");
    expect(items[2].position).toBe(3);
  });

  it("generates correct breadcrumb for product listing page", () => {
    const ld = buildBreadcrumbJsonLd([
      { name: "Home", url: SITE_URL },
      { name: "Products", url: `${SITE_URL}/products` },
    ]) as Record<string, unknown>;

    const items = ld.itemListElement as Array<Record<string, unknown>>;
    expect(items).toHaveLength(2);
    expect(items[1].name).toBe("Products");
    expect(items[1].position).toBe(2);
  });

  it("generates correct breadcrumb for content detail page", () => {
    const ld = buildBreadcrumbJsonLd([
      { name: "Home", url: SITE_URL },
      { name: "Guides & Reviews", url: `${SITE_URL}/content` },
      { name: "Best Running Shoes", url: `${SITE_URL}/content/best-running-shoes` },
    ]) as Record<string, unknown>;

    const items = ld.itemListElement as Array<Record<string, unknown>>;
    expect(items).toHaveLength(3);
    expect(items[1].name).toBe("Guides & Reviews");
    expect(items[2].name).toBe("Best Running Shoes");
  });

  it("generates correct breadcrumb for content listing page", () => {
    const ld = buildBreadcrumbJsonLd([
      { name: "Home", url: SITE_URL },
      { name: "Guides & Reviews", url: `${SITE_URL}/content` },
    ]) as Record<string, unknown>;

    const items = ld.itemListElement as Array<Record<string, unknown>>;
    expect(items).toHaveLength(2);
    expect(items[0].position).toBe(1);
    expect(items[1].position).toBe(2);
  });
});

/* ─── Organization JSON-LD (homepage) ──────────────────────────────── */

describe("Organization JSON-LD for homepage", () => {
  it("includes correct schema properties", () => {
    const ld = buildOrganizationJsonLd(SITE_URL) as Record<string, unknown>;
    expect(ld["@context"]).toBe("https://schema.org");
    expect(ld["@type"]).toBe("Organization");
    expect(ld.name).toBe("Maison Émile");
    expect(ld.url).toBe(SITE_URL);
    expect(ld.logo).toBe(`${SITE_URL}/logo.png`);
  });
});

/* ─── Article wordCount enhancement ───────────────────────────────── */

describe("wordCount for Article JSON-LD", () => {
  it("counts words in real editorial content", () => {
    const markdown = `## Best Running Shoes 2026

Looking for the **perfect pair** of running shoes? We've tested *dozens* of options.

{{product:shoe-123}}

### Our Top Pick

The [Nike Air Zoom](https://example.com) offers incredible comfort and performance.`;

    const count = wordCount(markdown);
    expect(count).toBeGreaterThan(15);
    expect(count).toBeLessThan(40);
  });

  it("removes code blocks before counting", () => {
    const markdown = "Hello world\n\n```js\nconst x = 1;\n```\n\nGoodbye";
    expect(wordCount(markdown)).toBe(3); // Hello, world, Goodbye
  });
});
