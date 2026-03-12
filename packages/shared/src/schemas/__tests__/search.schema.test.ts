import { describe, it, expect } from "vitest";
import { searchQuerySchema, searchResponseSchema, productMatchSchema } from "../search.schema.js";

describe("searchQuerySchema", () => {
  it("parses a valid search query", () => {
    const result = searchQuerySchema.safeParse({ query: "gift for dad" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.query).toBe("gift for dad");
    }
  });

  it("parses query with all optional fields", () => {
    const input = {
      query: "wireless headphones",
      filters: { category: "Electronics", minPrice: 2000, maxPrice: 10000, inStock: true },
      limit: 5,
    };
    const result = searchQuerySchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.filters?.category).toBe("Electronics");
      expect(result.data.limit).toBe(5);
    }
  });

  it("rejects empty query", () => {
    const result = searchQuerySchema.safeParse({ query: "" });
    expect(result.success).toBe(false);
  });

  it("rejects query under 2 characters", () => {
    const result = searchQuerySchema.safeParse({ query: "a" });
    expect(result.success).toBe(false);
  });

  it("rejects query over 500 characters", () => {
    const result = searchQuerySchema.safeParse({ query: "x".repeat(501) });
    expect(result.success).toBe(false);
  });

  it("accepts query of exactly 2 characters", () => {
    const result = searchQuerySchema.safeParse({ query: "ab" });
    expect(result.success).toBe(true);
  });

  it("accepts query of exactly 500 characters", () => {
    const result = searchQuerySchema.safeParse({ query: "x".repeat(500) });
    expect(result.success).toBe(true);
  });

  it("parses optional filters correctly", () => {
    const result = searchQuerySchema.safeParse({
      query: "shoes",
      filters: { minPrice: 0, maxPrice: 50000 },
    });
    expect(result.success).toBe(true);
  });

  it("rejects limit below 1", () => {
    const result = searchQuerySchema.safeParse({ query: "test", limit: 0 });
    expect(result.success).toBe(false);
  });

  it("rejects limit above 50", () => {
    const result = searchQuerySchema.safeParse({ query: "test", limit: 51 });
    expect(result.success).toBe(false);
  });
});

describe("productMatchSchema", () => {
  /** L2 fix: full product match with all fields the Edge Function returns */
  const validProduct = {
    id: "123",
    name: "Test Product",
    description: "A nice product",
    minPrice: 1000,
    maxPrice: 2000,
    currency: "USD",
    available: true,
    vendor: "TestBrand",
    source: "Shopify",
    externalUrl: "https://shop.example.com/product/123",
    thumbnailUrl: "https://cdn.example.com/img.jpg",
    similarity: 0.85,
  };

  it("validates a complete product match", () => {
    const result = productMatchSchema.safeParse(validProduct);
    expect(result.success).toBe(true);
  });

  it("accepts null thumbnailUrl (product with no images)", () => {
    const result = productMatchSchema.safeParse({ ...validProduct, thumbnailUrl: null });
    expect(result.success).toBe(true);
  });

  it("rejects similarity above 1", () => {
    const result = productMatchSchema.safeParse({ ...validProduct, similarity: 1.5 });
    expect(result.success).toBe(false);
  });

  it("rejects similarity below 0", () => {
    const result = productMatchSchema.safeParse({ ...validProduct, similarity: -0.1 });
    expect(result.success).toBe(false);
  });

  it("rejects missing source field", () => {
    const { source: _, ...withoutSource } = validProduct;
    const result = productMatchSchema.safeParse(withoutSource);
    expect(result.success).toBe(false);
  });

  it("rejects missing thumbnailUrl field", () => {
    const { thumbnailUrl: _, ...withoutThumb } = validProduct;
    const result = productMatchSchema.safeParse(withoutThumb);
    expect(result.success).toBe(false);
  });
});

describe("searchResponseSchema", () => {
  it("validates a complete search response", () => {
    const result = searchResponseSchema.safeParse({
      query: "gift for dad",
      products: [
        {
          id: "123",
          name: "BBQ Set",
          description: "Premium BBQ tools",
          minPrice: 3500,
          maxPrice: 3500,
          currency: "USD",
          available: true,
          vendor: "GrillMaster",
          source: "Shopify",
          externalUrl: "https://shop.example.com/bbq",
          thumbnailUrl: "https://cdn.example.com/bbq.jpg",
          similarity: 0.92,
        },
      ],
      total: 1,
      explanations: { "123": 'Matches your search for "gift", "dad" — 92% relevant' },
    });
    expect(result.success).toBe(true);
  });

  it("validates empty search response", () => {
    const result = searchResponseSchema.safeParse({
      query: "nonexistent product",
      products: [],
      total: 0,
      explanations: {},
    });
    expect(result.success).toBe(true);
  });

  it("rejects negative total", () => {
    const result = searchResponseSchema.safeParse({
      query: "test",
      products: [],
      total: -1,
      explanations: {},
    });
    expect(result.success).toBe(false);
  });
});
