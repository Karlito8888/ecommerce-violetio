import { describe, expect, it } from "vitest";
import {
  collectUrlEntries,
  escapeXml,
  formatDate,
  generateSitemapIndex,
  generateUrlsetXml,
  MAX_URLS_PER_SITEMAP,
  STATIC_PAGES,
} from "../../../../scripts/sitemap-utils";
import type { ContentRow, ProductRow } from "../../../../scripts/sitemap-utils";

describe("generate-sitemap", () => {
  describe("escapeXml", () => {
    it("escapes ampersands", () => {
      expect(escapeXml("foo&bar")).toBe("foo&amp;bar");
    });

    it("escapes angle brackets", () => {
      expect(escapeXml("<tag>")).toBe("&lt;tag&gt;");
    });

    it("escapes single and double quotes", () => {
      expect(escapeXml('it\'s a "test"')).toBe("it&apos;s a &quot;test&quot;");
    });

    it("handles strings with no special characters", () => {
      expect(escapeXml("https://example.com/path")).toBe("https://example.com/path");
    });

    it("escapes multiple special characters in one string", () => {
      expect(escapeXml("a&b<c>d'e\"f")).toBe("a&amp;b&lt;c&gt;d&apos;e&quot;f");
    });
  });

  describe("formatDate", () => {
    it("formats a valid date string to YYYY-MM-DD", () => {
      expect(formatDate("2026-03-15T10:30:00Z")).toBe("2026-03-15");
    });

    it("returns null for null input", () => {
      expect(formatDate(null)).toBeNull();
    });

    it("returns null for invalid date string", () => {
      expect(formatDate("not-a-date")).toBeNull();
    });

    it("returns null for empty string", () => {
      expect(formatDate("")).toBeNull();
    });

    it("handles ISO date strings with timezone", () => {
      expect(formatDate("2026-01-01T00:00:00.000Z")).toBe("2026-01-01");
    });
  });

  describe("STATIC_PAGES", () => {
    it("includes homepage, products, content, and about", () => {
      const paths = STATIC_PAGES.map((p) => p.path);
      expect(paths).toContain("/");
      expect(paths).toContain("/products");
      expect(paths).toContain("/content");
      expect(paths).toContain("/about");
    });

    it("has content listing with daily changefreq and 0.8 priority", () => {
      const contentPage = STATIC_PAGES.find((p) => p.path === "/content");
      expect(contentPage).toBeDefined();
      expect(contentPage!.changefreq).toBe("daily");
      expect(contentPage!.priority).toBe("0.8");
    });
  });

  describe("MAX_URLS_PER_SITEMAP", () => {
    it("is set to 50,000", () => {
      expect(MAX_URLS_PER_SITEMAP).toBe(50_000);
    });
  });

  describe("collectUrlEntries", () => {
    const siteUrl = "https://example.com";

    it("returns static page entries when no products or content", () => {
      const entries = collectUrlEntries(siteUrl, [], []);
      expect(entries).toHaveLength(STATIC_PAGES.length);
      expect(entries[0]).toContain("<loc>https://example.com/</loc>");
    });

    it("includes lastmod on static pages with the provided today param", () => {
      const entries = collectUrlEntries(siteUrl, [], [], "2026-03-20");
      for (const entry of entries) {
        expect(entry).toContain("<lastmod>2026-03-20</lastmod>");
      }
    });

    it("includes product entries with correct format", () => {
      const products: ProductRow[] = [
        { product_id: "prod-123", updated_at: "2026-03-10T00:00:00Z" },
      ];
      const entries = collectUrlEntries(siteUrl, products, []);
      const productEntry = entries.find((e) => e.includes("prod-123"));
      expect(productEntry).toBeDefined();
      expect(productEntry).toContain("<loc>https://example.com/products/prod-123</loc>");
      expect(productEntry).toContain("<lastmod>2026-03-10</lastmod>");
      expect(productEntry).toContain("<changefreq>daily</changefreq>");
      expect(productEntry).toContain("<priority>0.8</priority>");
    });

    it("omits lastmod for products with null updated_at", () => {
      const products: ProductRow[] = [{ product_id: "p1", updated_at: null }];
      const entries = collectUrlEntries(siteUrl, products, [], "2026-03-20");
      const productEntry = entries.find((e) => e.includes("p1"));
      expect(productEntry).toBeDefined();
      expect(productEntry).not.toContain("<lastmod>");
    });

    it("includes content entries with correct format", () => {
      const content: ContentRow[] = [
        { slug: "best-headphones-2026", updated_at: "2026-03-12T00:00:00Z" },
      ];
      const entries = collectUrlEntries(siteUrl, [], content);
      const contentEntry = entries.find((e) => e.includes("best-headphones-2026"));
      expect(contentEntry).toBeDefined();
      expect(contentEntry).toContain("<loc>https://example.com/content/best-headphones-2026</loc>");
      expect(contentEntry).toContain("<lastmod>2026-03-12</lastmod>");
      expect(contentEntry).toContain("<changefreq>weekly</changefreq>");
      expect(contentEntry).toContain("<priority>0.7</priority>");
    });

    it("combines static, product, and content entries in order", () => {
      const products: ProductRow[] = [{ product_id: "p1", updated_at: null }];
      const content: ContentRow[] = [{ slug: "guide-1", updated_at: null }];
      const entries = collectUrlEntries(siteUrl, products, content);
      expect(entries).toHaveLength(STATIC_PAGES.length + 1 + 1);
    });

    it("escapes special characters in content slugs", () => {
      const content: ContentRow[] = [{ slug: "guide&tips", updated_at: null }];
      const entries = collectUrlEntries(siteUrl, [], content);
      const contentEntry = entries.find((e) => e.includes("guide"));
      expect(contentEntry).toContain("guide&amp;tips");
    });
  });

  describe("generateUrlsetXml", () => {
    it("generates valid XML with urlset wrapper", () => {
      const entries = ["  <url>\n    <loc>https://example.com/</loc>\n  </url>"];
      const xml = generateUrlsetXml(entries, {
        products: 0,
        contentPages: 0,
        generatedAt: "2026-03-20T00:00:00Z",
      });
      expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
      expect(xml).toContain("</urlset>");
      expect(xml).toContain("<loc>https://example.com/</loc>");
    });

    it("includes product and content counts in comment", () => {
      const xml = generateUrlsetXml([], {
        products: 5,
        contentPages: 3,
        generatedAt: "2026-03-20T00:00:00Z",
      });
      expect(xml).toContain("Products: 5, Content pages: 3");
    });

    it("produces valid XML with no entries", () => {
      const xml = generateUrlsetXml([], {
        products: 0,
        contentPages: 0,
        generatedAt: "2026-03-20T00:00:00Z",
      });
      expect(xml).toContain("<urlset");
      expect(xml).toContain("</urlset>");
    });
  });

  describe("generateSitemapIndex", () => {
    const siteUrl = "https://example.com";

    it("generates valid sitemapindex XML", () => {
      const xml = generateSitemapIndex(siteUrl, ["sitemap-1.xml", "sitemap-2.xml"]);
      expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(xml).toContain('<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
      expect(xml).toContain("</sitemapindex>");
    });

    it("lists all sub-sitemap files with correct loc", () => {
      const xml = generateSitemapIndex(siteUrl, ["sitemap-1.xml", "sitemap-2.xml"]);
      expect(xml).toContain("<loc>https://example.com/sitemap-1.xml</loc>");
      expect(xml).toContain("<loc>https://example.com/sitemap-2.xml</loc>");
    });

    it("includes lastmod with provided date", () => {
      const xml = generateSitemapIndex(siteUrl, ["sitemap-1.xml"], "2026-03-20");
      expect(xml).toContain("<lastmod>2026-03-20</lastmod>");
    });

    it("handles a single sub-sitemap", () => {
      const xml = generateSitemapIndex(siteUrl, ["sitemap-1.xml"]);
      expect(xml).toContain("<loc>https://example.com/sitemap-1.xml</loc>");
      expect((xml.match(/<sitemap>/g) ?? []).length).toBe(1);
    });

    it("produces valid XML with empty file list", () => {
      const xml = generateSitemapIndex(siteUrl, []);
      expect(xml).toContain("<sitemapindex");
      expect(xml).toContain("</sitemapindex>");
      expect(xml).not.toContain("<sitemap>");
    });
  });
});
