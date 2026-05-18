/**
 * Convex tests for content queries.
 *
 * Tests: getContentPageBySlug, getContentPages, getRelatedContent, getFaqItems
 *
 * Covers: published content filtering, pagination, FAQ grouping, slug lookup.
 *
 * @module convex/__tests__/content.test
 */
import { describe, it, expect } from "vitest";
import { convexTest } from "./helpers";
import { api } from "../_generated/api";

/**
 * Seeds a content page. Returns the document ID.
 */
async function seedContentPage(
  t: ReturnType<typeof convexTest>,
  overrides: {
    slug?: string;
    title?: string;
    type?: string;
    status?: string;
    publishedAt?: number;
    sortOrder?: number;
    relatedSlugs?: string[];
  } = {},
) {
  return t.run(async (ctx) => {
    return ctx.db.insert("contentPages", {
      slug: overrides.slug ?? "test-guide",
      title: overrides.title ?? "Test Guide",
      type: overrides.type ?? "guide",
      bodyMarkdown: "# Hello\n\nWorld",
      author: "Admin",
      status: overrides.status ?? "published",
      publishedAt: overrides.publishedAt ?? 1000,
      sortOrder: overrides.sortOrder ?? 0,
      relatedSlugs: overrides.relatedSlugs,
    });
  });
}

/**
 * Seeds a FAQ item.
 */
async function seedFaqItem(
  t: ReturnType<typeof convexTest>,
  overrides: {
    category?: string;
    question?: string;
    isPublished?: boolean;
    sortOrder?: number;
  } = {},
) {
  return t.run(async (ctx) => {
    return ctx.db.insert("faqItems", {
      category: overrides.category ?? "general",
      question: overrides.question ?? "What is this?",
      answerMarkdown: "This is a test answer.",
      sortOrder: overrides.sortOrder ?? 0,
      isPublished: overrides.isPublished ?? true,
    });
  });
}

describe("content queries", () => {
  // ─── getContentPageBySlug ──────────────────────────────────────────

  describe("getContentPageBySlug", () => {
    it("returns published page by slug", async () => {
      const t = convexTest();

      await seedContentPage(t, { slug: "my-guide", title: "My Guide" });

      const page = await t.query(api.content.queries.getContentPageBySlug, {
        slug: "my-guide",
        now: Date.now(),
      });

      expect(page).not.toBeNull();
      expect(page!.title).toBe("My Guide");
      expect(page!.slug).toBe("my-guide");
    });

    it("returns null for non-existent slug", async () => {
      const t = convexTest();

      const page = await t.query(api.content.queries.getContentPageBySlug, {
        slug: "nonexistent",
        now: Date.now(),
      });

      expect(page).toBeNull();
    });

    it("returns null for draft page", async () => {
      const t = convexTest();

      await seedContentPage(t, { slug: "draft-page", status: "draft" });

      const page = await t.query(api.content.queries.getContentPageBySlug, {
        slug: "draft-page",
        now: Date.now(),
      });

      expect(page).toBeNull();
    });

    it("returns null for page with future publish date", async () => {
      const t = convexTest();

      const futureDate = Date.now() + 365 * 24 * 60 * 60 * 1000; // 1 year from now
      await seedContentPage(t, { slug: "future-page", publishedAt: futureDate });

      const page = await t.query(api.content.queries.getContentPageBySlug, {
        slug: "future-page",
        now: Date.now(),
      });

      expect(page).toBeNull();
    });
  });

  // ─── getContentPages (paginated) ───────────────────────────────────

  describe("getContentPages", () => {
    it("returns published pages excluding legal type", async () => {
      const t = convexTest();

      await seedContentPage(t, { slug: "guide-1", type: "guide", sortOrder: 10 });
      await seedContentPage(t, { slug: "legal-1", type: "legal", sortOrder: 5 });
      await seedContentPage(t, { slug: "review-1", type: "review", sortOrder: 3 });

      const result = await t.query(api.content.queries.getContentPages, {
        paginationOpts: { numItems: 10, cursor: null },
        now: Date.now(),
      });

      // Legal type excluded from unfiltered listing
      const slugs = result.page.map((p: { slug: string }) => p.slug).sort();
      expect(slugs).toEqual(["guide-1", "review-1"]);
    });

    it("filters by type", async () => {
      const t = convexTest();

      await seedContentPage(t, { slug: "guide-1", type: "guide" });
      await seedContentPage(t, { slug: "guide-2", type: "guide" });
      await seedContentPage(t, { slug: "review-1", type: "review" });

      const result = await t.query(api.content.queries.getContentPages, {
        type: "guide",
        paginationOpts: { numItems: 10, cursor: null },
        now: Date.now(),
      });

      expect(result.page).toHaveLength(2);
      expect(result.page.every((p: { type: string }) => p.type === "guide")).toBe(true);
    });

    it("excludes pages with future publish date", async () => {
      const t = convexTest();

      const futureDate = Date.now() + 365 * 24 * 60 * 60 * 1000;
      await seedContentPage(t, { slug: "published", publishedAt: 1000 });
      await seedContentPage(t, { slug: "future", publishedAt: futureDate });

      const result = await t.query(api.content.queries.getContentPages, {
        paginationOpts: { numItems: 10, cursor: null },
        now: Date.now(),
      });

      expect(result.page).toHaveLength(1);
      expect(result.page[0].slug).toBe("published");
    });
  });

  // ─── getRelatedContent ─────────────────────────────────────────────

  describe("getRelatedContent", () => {
    it("returns related pages matching slugs in input order", async () => {
      const t = convexTest();

      await seedContentPage(t, { slug: "guide-b", sortOrder: 1 });
      await seedContentPage(t, { slug: "guide-a", sortOrder: 2 });
      await seedContentPage(t, { slug: "guide-c", sortOrder: 3 });

      const result = await t.query(api.content.queries.getRelatedContent, {
        slugs: ["guide-c", "guide-a"], // Intentionally out of creation order
        now: Date.now(),
      });

      expect(result).toHaveLength(2);
      // Should match the input slug order, not creation order
      expect(result[0].slug).toBe("guide-c");
      expect(result[1].slug).toBe("guide-a");
    });

    it("returns empty array for empty slugs", async () => {
      const t = convexTest();

      const result = await t.query(api.content.queries.getRelatedContent, {
        slugs: [],
        now: Date.now(),
      });

      expect(result).toEqual([]);
    });

    it("ignores non-existent slugs", async () => {
      const t = convexTest();

      await seedContentPage(t, { slug: "exists" });

      const result = await t.query(api.content.queries.getRelatedContent, {
        slugs: ["exists", "ghost"],
        now: Date.now(),
      });

      expect(result).toHaveLength(1);
      expect(result[0].slug).toBe("exists");
    });
  });

  // ─── getFaqItems ──────────────────────────────────────────────────

  describe("getFaqItems", () => {
    it("returns FAQ items grouped by category", async () => {
      const t = convexTest();

      await seedFaqItem(t, { category: "shipping", question: "How long?", sortOrder: 1 });
      await seedFaqItem(t, { category: "shipping", question: "Track order?", sortOrder: 2 });
      await seedFaqItem(t, { category: "returns", question: "Return policy?", sortOrder: 1 });

      const result = await t.query(api.content.queries.getFaqItems);

      expect(result).toHaveLength(2);
      // Categories sorted alphabetically (by name)
      expect(result[0].name).toBe("returns");
      expect(result[0].items).toHaveLength(1);
      expect(result[1].name).toBe("shipping");
      expect(result[1].items).toHaveLength(2);
    });

    it("excludes unpublished items", async () => {
      const t = convexTest();

      await seedFaqItem(t, { category: "general", isPublished: true });
      await seedFaqItem(t, { category: "general", isPublished: false });

      const result = await t.query(api.content.queries.getFaqItems);

      expect(result).toHaveLength(1);
      expect(result[0].items).toHaveLength(1);
    });

    it("returns empty array when no FAQ items", async () => {
      const t = convexTest();

      const result = await t.query(api.content.queries.getFaqItems);

      expect(result).toEqual([]);
    });
  });
});
