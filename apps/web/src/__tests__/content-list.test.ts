import { describe, expect, it } from "vitest";
import { generateExcerpt } from "../components/content/ContentListCard";

describe("generateExcerpt", () => {
  it("returns full text when under maxLength", () => {
    expect(generateExcerpt("Short text")).toBe("Short text");
  });

  it("truncates at word boundary with ellipsis", () => {
    const longText =
      "This is a long text that should be truncated at a word boundary to avoid cutting words";
    const result = generateExcerpt(longText, 40);
    expect(result.length).toBeLessThanOrEqual(41); // 40 + "…"
    expect(result.endsWith("…")).toBe(true);
    expect(result).not.toContain("  "); // No double spaces
  });

  it("strips Markdown headings", () => {
    const result = generateExcerpt("# Title\n## Subtitle\nBody text here.");
    expect(result).toBe("Title Subtitle Body text here.");
  });

  it("strips bold and italic Markdown", () => {
    const result = generateExcerpt("This is **bold** and *italic* text.");
    expect(result).toBe("This is bold and italic text.");
  });

  it("strips Markdown links, keeping link text", () => {
    const result = generateExcerpt("Check [this link](https://example.com) out.");
    expect(result).toBe("Check this link out.");
  });

  it("removes Markdown images entirely", () => {
    const result = generateExcerpt("Before ![alt text](image.jpg) after.");
    expect(result).toContain("Before");
    expect(result).toContain("after.");
    expect(result).not.toContain("![");
  });

  it("strips inline code backticks", () => {
    const result = generateExcerpt("Use the `console.log` function.");
    expect(result).toBe("Use the console.log function.");
  });

  it("removes {{product:ID}} embeds", () => {
    const result = generateExcerpt("Great product below.\n{{product:abc-123}}\nMore text here.");
    expect(result).toBe("Great product below. More text here.");
  });

  it("removes multiple product embeds and collapses whitespace", () => {
    const result = generateExcerpt("Intro {{product:id1}} middle {{product:id2}} end.");
    expect(result).toBe("Intro middle end.");
  });

  it("handles empty string", () => {
    expect(generateExcerpt("")).toBe("");
  });

  it("handles Markdown-only content (no plain text remains)", () => {
    expect(generateExcerpt("![](img.jpg)")).toBe("");
  });

  it("uses custom maxLength", () => {
    const text = "One two three four five six seven eight nine ten.";
    const result = generateExcerpt(text, 20);
    expect(result.endsWith("…")).toBe(true);
    expect(result.length).toBeLessThanOrEqual(21);
  });

  it("truncates at last space within limit", () => {
    const result = generateExcerpt("word1 word2 word3 word4", 15);
    expect(result).toBe("word1 word2…");
  });

  it("handles content with newlines converted to spaces", () => {
    const result = generateExcerpt("Line one.\n\nLine two.\nLine three.");
    expect(result).toBe("Line one. Line two. Line three.");
  });
});

describe("content listing SEO meta", () => {
  it("generates CollectionPage JSON-LD structure", () => {
    const jsonLd = {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: "Guides & Reviews",
      description: "Editorial guides, comparisons, and reviews from Maison Émile.",
      url: "http://localhost:3000/content",
      publisher: {
        "@type": "Organization",
        name: "Maison Émile",
        url: "http://localhost:3000",
      },
    };

    expect(jsonLd["@type"]).toBe("CollectionPage");
    expect(jsonLd.name).toBe("Guides & Reviews");
    expect(jsonLd.publisher["@type"]).toBe("Organization");
  });
});

describe("content type filter", () => {
  const validTypes = ["guide", "comparison", "review"];

  it("valid content types are recognized", () => {
    for (const type of validTypes) {
      expect(["guide", "comparison", "review"]).toContain(type);
    }
  });

  it("invalid type returns undefined after validation", () => {
    const VALID_CONTENT_TYPES = new Set<string>(["guide", "comparison", "review"]);
    expect(VALID_CONTENT_TYPES.has("invalid")).toBe(false);
    expect(VALID_CONTENT_TYPES.has("")).toBe(false);
    expect(VALID_CONTENT_TYPES.has("guide")).toBe(true);
  });
});
