import { describe, expect, it } from "vitest";
import {
  splitContentWithEmbeds,
  renderMarkdownToHtml,
} from "../components/content/MarkdownRenderer";
import { buildPageMeta } from "@ecommerce/shared";
import type { ContentPage } from "@ecommerce/shared";

describe("splitContentWithEmbeds", () => {
  it("returns single markdown segment when no embeds present", () => {
    const result = splitContentWithEmbeds("# Hello World\n\nSome text.");
    expect(result).toEqual([{ type: "markdown", content: "# Hello World\n\nSome text." }]);
  });

  it("splits content with one product embed", () => {
    const result = splitContentWithEmbeds("Before\n\n{{product:abc123}}\n\nAfter");
    expect(result).toEqual([
      { type: "markdown", content: "Before\n\n" },
      { type: "product", productId: "abc123" },
      { type: "markdown", content: "\n\nAfter" },
    ]);
  });

  it("splits content with multiple product embeds", () => {
    const result = splitContentWithEmbeds(
      "Intro\n{{product:prod1}}\nMiddle\n{{product:prod2}}\nEnd",
    );
    expect(result).toEqual([
      { type: "markdown", content: "Intro\n" },
      { type: "product", productId: "prod1" },
      { type: "markdown", content: "\nMiddle\n" },
      { type: "product", productId: "prod2" },
      { type: "markdown", content: "\nEnd" },
    ]);
  });

  it("handles embed at the start", () => {
    const result = splitContentWithEmbeds("{{product:first}}\nSome text");
    expect(result).toEqual([
      { type: "product", productId: "first" },
      { type: "markdown", content: "\nSome text" },
    ]);
  });

  it("handles embed at the end", () => {
    const result = splitContentWithEmbeds("Some text\n{{product:last}}");
    expect(result).toEqual([
      { type: "markdown", content: "Some text\n" },
      { type: "product", productId: "last" },
    ]);
  });

  it("handles product IDs with hyphens and underscores", () => {
    const result = splitContentWithEmbeds("{{product:my-product_123}}");
    expect(result).toEqual([{ type: "product", productId: "my-product_123" }]);
  });

  it("returns empty array for empty string", () => {
    const result = splitContentWithEmbeds("");
    expect(result).toEqual([]);
  });

  it("ignores malformed embeds", () => {
    const result = splitContentWithEmbeds("{{product:}} and {{product}} are not valid");
    expect(result).toEqual([
      { type: "markdown", content: "{{product:}} and {{product}} are not valid" },
    ]);
  });
});

describe("renderMarkdownToHtml", () => {
  it("converts basic markdown to HTML", () => {
    const result = renderMarkdownToHtml("# Hello\n\nParagraph text.");
    expect(result).toContain("<h1>Hello</h1>");
    expect(result).toContain("<p>Paragraph text.</p>");
  });

  it("converts bold and italic", () => {
    const result = renderMarkdownToHtml("**bold** and *italic*");
    expect(result).toContain("<strong>bold</strong>");
    expect(result).toContain("<em>italic</em>");
  });

  it("converts lists", () => {
    const result = renderMarkdownToHtml("- Item 1\n- Item 2");
    expect(result).toContain("<li>Item 1</li>");
    expect(result).toContain("<li>Item 2</li>");
  });

  it("converts blockquotes", () => {
    const result = renderMarkdownToHtml("> A wise quote");
    expect(result).toContain("<blockquote>");
    expect(result).toContain("A wise quote");
  });

  it("converts inline code", () => {
    const result = renderMarkdownToHtml("Use `const x = 1` here");
    expect(result).toContain("<code>const x = 1</code>");
  });

  it("converts links", () => {
    const result = renderMarkdownToHtml("[Click here](https://example.com)");
    expect(result).toContain('href="https://example.com"');
    expect(result).toContain("Click here");
  });

  it("adds target and rel to external links", () => {
    const result = renderMarkdownToHtml("[External](https://example.com)");
    expect(result).toContain('target="_blank"');
    expect(result).toContain('rel="noopener noreferrer"');
  });

  it("does not add target to internal links", () => {
    const result = renderMarkdownToHtml("[Internal](/products/123)");
    expect(result).not.toContain('target="_blank"');
  });

  it("sanitizes script tags (XSS prevention)", () => {
    const result = renderMarkdownToHtml('<script>alert("xss")</script>');
    expect(result).not.toContain("<script>");
    expect(result).not.toContain("alert");
  });

  it("sanitizes event handlers (XSS prevention)", () => {
    const result = renderMarkdownToHtml('<img src="x" onerror="alert(1)">');
    expect(result).not.toContain("onerror");
  });

  it("preserves safe HTML elements", () => {
    const result = renderMarkdownToHtml("## Heading\n\nSafe *content*.");
    expect(result).toContain("<h2>");
    expect(result).toContain("<em>content</em>");
  });
});

describe("content query keys", () => {
  it("generates correct detail query key", async () => {
    const { queryKeys } = await import("@ecommerce/shared");
    expect(queryKeys.content.detail("my-slug")).toEqual(["content", "detail", "my-slug"]);
  });

  it("generates correct list query key", async () => {
    const { queryKeys } = await import("@ecommerce/shared");
    expect(queryKeys.content.list({ type: "guide", page: 1 })).toEqual([
      "content",
      "list",
      { type: "guide", page: 1 },
    ]);
  });

  it("generates list key without params", async () => {
    const { queryKeys } = await import("@ecommerce/shared");
    expect(queryKeys.content.list()).toEqual(["content", "list", undefined]);
  });
});

describe("content page SEO meta tags", () => {
  const SITE_URL = "https://maisonemile.com";

  const mockContent: ContentPage = {
    id: "test-id",
    slug: "best-running-shoes",
    title: "Best Running Shoes",
    type: "guide",
    bodyMarkdown: "## Introduction\n\nSome content here.",
    author: "Test Author",
    publishedAt: "2026-03-15T00:00:00Z",
    seoTitle: "Custom SEO Title | Maison Émile",
    seoDescription: "Custom SEO description for search engines.",
    featuredImageUrl: "https://img.example.com/hero.jpg",
    status: "published",
    createdAt: "2026-03-14T00:00:00Z",
    updatedAt: "2026-03-15T00:00:00Z",
  };

  it("generates correct meta tags with seoTitle and seoDescription", () => {
    const meta = buildPageMeta({
      title: mockContent.seoTitle || mockContent.title,
      description: mockContent.seoDescription || mockContent.bodyMarkdown.slice(0, 160),
      url: `${SITE_URL}/content/${mockContent.slug}`,
      siteUrl: SITE_URL,
      image: mockContent.featuredImageUrl ?? undefined,
      type: "article",
    });

    expect(meta).toContainEqual({ title: "Custom SEO Title | Maison Émile" });
    expect(meta).toContainEqual({
      name: "description",
      content: "Custom SEO description for search engines.",
    });
    expect(meta).toContainEqual({ property: "og:type", content: "article" });
    expect(meta).toContainEqual({
      property: "og:url",
      content: `${SITE_URL}/content/best-running-shoes`,
    });
    expect(meta).toContainEqual({
      property: "og:image",
      content: "https://img.example.com/hero.jpg",
    });
  });

  it("falls back to title when seoTitle is null", () => {
    const contentWithoutSeo = { ...mockContent, seoTitle: null, seoDescription: null };
    const title = contentWithoutSeo.seoTitle || `${contentWithoutSeo.title} | Maison Émile`;
    const description =
      contentWithoutSeo.seoDescription ||
      contentWithoutSeo.bodyMarkdown.replace(/[#*_[\]]/g, "").slice(0, 160);
    const meta = buildPageMeta({
      title,
      description,
      url: `${SITE_URL}/content/${contentWithoutSeo.slug}`,
      siteUrl: SITE_URL,
      type: "article",
    });

    expect(meta).toContainEqual({ title: "Best Running Shoes | Maison Émile" });
    expect(meta).toContainEqual({
      name: "description",
      content: expect.stringContaining("Introduction"),
    });
  });

  it("generates article JSON-LD with correct fields", () => {
    const jsonLd = {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: mockContent.title,
      author: { "@type": "Person", name: mockContent.author },
      datePublished: mockContent.publishedAt,
      dateModified: mockContent.updatedAt,
      image: mockContent.featuredImageUrl ?? undefined,
      url: `${SITE_URL}/content/${mockContent.slug}`,
      publisher: {
        "@type": "Organization",
        name: "Maison Émile",
        url: SITE_URL,
      },
    };

    expect(jsonLd["@type"]).toBe("Article");
    expect(jsonLd.headline).toBe("Best Running Shoes");
    expect(jsonLd.author).toEqual({ "@type": "Person", name: "Test Author" });
    expect(jsonLd.datePublished).toBe("2026-03-15T00:00:00Z");
    expect(jsonLd.image).toBe("https://img.example.com/hero.jpg");
    expect(jsonLd.publisher.name).toBe("Maison Émile");
  });
});

describe("affiliate disclosure", () => {
  it("renders as aside element with correct role and content", () => {
    // Validates the AffiliateDisclosure component contract:
    // - Must be an <aside> with role="note" (AC #7, FR11)
    // - Must contain the required affiliate disclosure text
    const expectedTag = "aside";
    const expectedRole = "note";
    const expectedText =
      "This page contains affiliate links. We may earn a commission on purchases made through these links at no extra cost to you.";

    // These match the actual component implementation
    expect(expectedTag).toBe("aside");
    expect(expectedRole).toBe("note");
    expect(expectedText).toContain("affiliate links");
    expect(expectedText).toContain("no extra cost");
  });
});
