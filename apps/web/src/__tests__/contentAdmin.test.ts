import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  isValidSlug,
  CONTENT_FIELD_GUIDE,
  getRelatedContent,
  getContentPages,
  configureEnv,
  _resetSupabaseClient,
} from "@ecommerce/shared";

describe("isValidSlug", () => {
  it("accepts valid slugs", () => {
    expect(isValidSlug("best-running-shoes-2026")).toBe(true);
    expect(isValidSlug("shoe-care-101")).toBe(true);
    expect(isValidSlug("ab")).toBe(true);
    expect(isValidSlug("a1")).toBe(true);
    expect(isValidSlug("top10-picks")).toBe(true);
    expect(isValidSlug("guide-2026")).toBe(true);
  });

  it("rejects slugs with uppercase", () => {
    expect(isValidSlug("Best-Running")).toBe(false);
    expect(isValidSlug("ALLCAPS")).toBe(false);
  });

  it("rejects slugs with spaces", () => {
    expect(isValidSlug("best running shoes")).toBe(false);
    expect(isValidSlug("shoe care")).toBe(false);
  });

  it("rejects slugs with leading hyphen", () => {
    expect(isValidSlug("-leading-hyphen")).toBe(false);
  });

  it("rejects slugs with trailing hyphen", () => {
    expect(isValidSlug("trailing-hyphen-")).toBe(false);
  });

  it("rejects single character slugs", () => {
    expect(isValidSlug("a")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isValidSlug("")).toBe(false);
  });

  it("rejects slugs with special characters", () => {
    expect(isValidSlug("slug_with_underscores")).toBe(false);
    expect(isValidSlug("slug.with.dots")).toBe(false);
    expect(isValidSlug("slug@with@at")).toBe(false);
  });
});

describe("CONTENT_FIELD_GUIDE", () => {
  it("contains all expected fields", () => {
    const expectedFields = [
      "slug",
      "title",
      "type",
      "body_markdown",
      "author",
      "status",
      "published_at",
      "seo_title",
      "seo_description",
      "featured_image_url",
      "tags",
      "related_slugs",
      "sort_order",
    ];

    for (const field of expectedFields) {
      expect(CONTENT_FIELD_GUIDE).toHaveProperty(field);
      expect(CONTENT_FIELD_GUIDE[field]).toHaveProperty("required");
      expect(CONTENT_FIELD_GUIDE[field]).toHaveProperty("description");
    }
  });

  it("marks required fields correctly", () => {
    expect(CONTENT_FIELD_GUIDE.slug.required).toBe(true);
    expect(CONTENT_FIELD_GUIDE.title.required).toBe(true);
    expect(CONTENT_FIELD_GUIDE.type.required).toBe(true);
    expect(CONTENT_FIELD_GUIDE.body_markdown.required).toBe(true);
    expect(CONTENT_FIELD_GUIDE.author.required).toBe(true);
    expect(CONTENT_FIELD_GUIDE.status.required).toBe(true);
  });

  it("marks optional fields correctly", () => {
    expect(CONTENT_FIELD_GUIDE.published_at.required).toBe(false);
    expect(CONTENT_FIELD_GUIDE.seo_title.required).toBe(false);
    expect(CONTENT_FIELD_GUIDE.tags.required).toBe(false);
    expect(CONTENT_FIELD_GUIDE.related_slugs.required).toBe(false);
    expect(CONTENT_FIELD_GUIDE.sort_order.required).toBe(false);
  });
});

/* ─── getRelatedContent tests ─── */

function buildContentMockClient(rows: Record<string, unknown>[], error: unknown = null) {
  return {
    from: (_table: string) => ({
      select: (_cols: string, _opts?: Record<string, unknown>) => ({
        in: (_col: string, _vals: string[]) => ({
          eq: (_col2: string, _val2: string) => ({
            lte: (_col3: string, _val3: string) =>
              Promise.resolve({ data: error ? null : rows, error }),
          }),
        }),
        eq: (_col2: string, _val2: string) => ({
          lte: (_col3: string, _val3: string) => ({
            order: (_col4: string, _opts2?: Record<string, unknown>) => ({
              order: (_col5: string, _opts3?: Record<string, unknown>) => ({
                range: (_from: number, _to: number) =>
                  Promise.resolve({ data: error ? null : rows, error, count: rows.length }),
              }),
            }),
          }),
        }),
      }),
    }),
    auth: { getSession: vi.fn(), onAuthStateChange: vi.fn() },
  };
}

describe("getRelatedContent", () => {
  beforeEach(() => {
    _resetSupabaseClient();
    configureEnv({ SUPABASE_URL: "http://localhost:54321", SUPABASE_ANON_KEY: "test-key" });
  });

  it("returns mapped content items for valid slugs, preserving input order", async () => {
    const mockRows = [
      {
        slug: "shoe-care-guide",
        title: "Shoe Care Guide",
        type: "guide",
        featured_image_url: "https://img.example.com/shoe.jpg",
        seo_description: "How to care for your shoes",
      },
      {
        slug: "running-tips",
        title: "Running Tips",
        type: "review",
        featured_image_url: null,
        seo_description: null,
      },
    ];

    const client = buildContentMockClient(mockRows);
    // Pass slugs in reverse order to verify re-sorting
    const result = await getRelatedContent(client as never, ["running-tips", "shoe-care-guide"]);

    expect(result).toHaveLength(2);
    // Should be in the order of the input slugs array, not DB order
    expect(result[0].slug).toBe("running-tips");
    expect(result[1].slug).toBe("shoe-care-guide");
  });

  it("returns empty array for empty slugs input", async () => {
    const client = buildContentMockClient([]);
    const result = await getRelatedContent(client as never, []);

    expect(result).toEqual([]);
  });

  it("returns empty array on Supabase error", async () => {
    const client = buildContentMockClient([], { message: "connection failed" });
    const result = await getRelatedContent(client as never, ["some-slug"]);

    expect(result).toEqual([]);
  });
});

/* ─── getContentPages sort_order tests ─── */

describe("getContentPages sort_order", () => {
  beforeEach(() => {
    _resetSupabaseClient();
    configureEnv({ SUPABASE_URL: "http://localhost:54321", SUPABASE_ANON_KEY: "test-key" });
  });

  it("returns featured content (high sort_order) before chronological content", async () => {
    const mockRows = [
      {
        id: "1",
        slug: "featured-article",
        title: "Featured Article",
        type: "guide",
        author: "Admin",
        published_at: "2026-03-01T00:00:00Z",
        seo_description: null,
        featured_image_url: null,
        status: "published",
        tags: [],
        sort_order: 100,
        created_at: "2026-03-01T00:00:00Z",
        updated_at: "2026-03-01T00:00:00Z",
      },
      {
        id: "2",
        slug: "recent-article",
        title: "Recent Article",
        type: "review",
        author: "Author",
        published_at: "2026-03-15T00:00:00Z",
        seo_description: null,
        featured_image_url: null,
        status: "published",
        tags: [],
        sort_order: 0,
        created_at: "2026-03-15T00:00:00Z",
        updated_at: "2026-03-15T00:00:00Z",
      },
    ];

    const client = buildContentMockClient(mockRows);
    const result = await getContentPages(client as never);

    expect(result.items).toHaveLength(2);
    expect(result.items[0].slug).toBe("featured-article");
    expect(result.items[0].sortOrder).toBe(100);
    expect(result.items[1].slug).toBe("recent-article");
    expect(result.items[1].sortOrder).toBe(0);
  });

  it("maps sort_order and tags fields correctly", async () => {
    const mockRows = [
      {
        id: "1",
        slug: "test-sort",
        title: "Test Sort",
        type: "guide",
        author: "Author",
        published_at: "2026-03-10T00:00:00Z",
        seo_description: null,
        featured_image_url: null,
        status: "published",
        tags: ["tag1"],
        sort_order: 50,
        created_at: "2026-03-10T00:00:00Z",
        updated_at: "2026-03-10T00:00:00Z",
      },
    ];

    const client = buildContentMockClient(mockRows);
    const result = await getContentPages(client as never);

    expect(result.items[0].sortOrder).toBe(50);
    expect(result.items[0].tags).toEqual(["tag1"]);
  });

  it("defaults sort_order to 0 and tags to [] when null", async () => {
    const mockRows = [
      {
        id: "1",
        slug: "null-sort",
        title: "Null Sort",
        type: "guide",
        author: "Author",
        published_at: "2026-03-10T00:00:00Z",
        seo_description: null,
        featured_image_url: null,
        status: "published",
        tags: null,
        sort_order: null,
        created_at: "2026-03-10T00:00:00Z",
        updated_at: "2026-03-10T00:00:00Z",
      },
    ];

    const client = buildContentMockClient(mockRows);
    const result = await getContentPages(client as never);

    expect(result.items[0].sortOrder).toBe(0);
    expect(result.items[0].tags).toEqual([]);
  });
});
