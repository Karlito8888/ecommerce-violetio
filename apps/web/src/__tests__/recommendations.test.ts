import { describe, it, expect } from "vitest";
import { queryKeys } from "@ecommerce/shared";
import { recommendationItemSchema, recommendationResponseSchema } from "@ecommerce/shared";

// ─── Query Key Tests ──────────────────────────────────────────────

describe("queryKeys.recommendations", () => {
  it("forProduct() returns correct key structure", () => {
    const key = queryKeys.recommendations.forProduct("product-123");
    expect(key).toEqual(["recommendations", "product-123"]);
  });

  it("forProduct() returns different keys for different products", () => {
    const key1 = queryKeys.recommendations.forProduct("product-A");
    const key2 = queryKeys.recommendations.forProduct("product-B");
    expect(key1).not.toEqual(key2);
  });

  it("forProduct() returns a readonly tuple", () => {
    const key = queryKeys.recommendations.forProduct("product-123");
    expect(key).toHaveLength(2);
    expect(key[0]).toBe("recommendations");
    expect(key[1]).toBe("product-123");
  });
});

// ─── Recommendation Item Schema Tests ─────────────────────────────

describe("recommendationItemSchema", () => {
  const validItem = {
    id: "prod-123",
    name: "Premium Chef Knife",
    description: "High-quality chef knife",
    minPrice: 4999,
    maxPrice: 5999,
    currency: "USD",
    available: true,
    vendor: "Kitchen Pro",
    source: "Shopify",
    externalUrl: "https://shop.example.com/knife",
    thumbnailUrl: "https://cdn.example.com/knife.jpg",
    similarity: 0.85,
  };

  it("validates a correct recommendation item", () => {
    const result = recommendationItemSchema.safeParse(validItem);
    expect(result.success).toBe(true);
  });

  it("accepts null thumbnailUrl", () => {
    const item = { ...validItem, thumbnailUrl: null };
    const result = recommendationItemSchema.safeParse(item);
    expect(result.success).toBe(true);
  });

  it("rejects missing required fields", () => {
    const { id: _, ...missingId } = validItem;
    const result = recommendationItemSchema.safeParse(missingId);
    expect(result.success).toBe(false);
  });

  it("rejects similarity outside 0-1 range", () => {
    const item = { ...validItem, similarity: 1.5 };
    const result = recommendationItemSchema.safeParse(item);
    expect(result.success).toBe(false);
  });

  it("rejects negative similarity", () => {
    const item = { ...validItem, similarity: -0.1 };
    const result = recommendationItemSchema.safeParse(item);
    expect(result.success).toBe(false);
  });
});

// ─── Recommendation Response Schema Tests ─────────────────────────

describe("recommendationResponseSchema", () => {
  const validItem = {
    id: "prod-123",
    name: "Premium Chef Knife",
    description: "High-quality chef knife",
    minPrice: 4999,
    maxPrice: 5999,
    currency: "USD",
    available: true,
    vendor: "Kitchen Pro",
    source: "Shopify",
    externalUrl: "https://shop.example.com/knife",
    thumbnailUrl: "https://cdn.example.com/knife.jpg",
    similarity: 0.85,
  };

  it("validates a response with products", () => {
    const response = {
      products: [validItem, { ...validItem, id: "prod-456", similarity: 0.72 }],
      personalized: false,
    };
    const result = recommendationResponseSchema.safeParse(response);
    expect(result.success).toBe(true);
  });

  it("validates an empty products array (no-embedding case)", () => {
    const response = {
      products: [],
      personalized: false,
    };
    const result = recommendationResponseSchema.safeParse(response);
    expect(result.success).toBe(true);
  });

  it("validates a personalized response", () => {
    const response = {
      products: [validItem],
      personalized: true,
    };
    const result = recommendationResponseSchema.safeParse(response);
    expect(result.success).toBe(true);
  });

  it("rejects response without personalized field", () => {
    const response = {
      products: [validItem],
    };
    const result = recommendationResponseSchema.safeParse(response);
    expect(result.success).toBe(false);
  });

  it("rejects response with invalid product item", () => {
    const response = {
      products: [{ id: "prod-123" }],
      personalized: false,
    };
    const result = recommendationResponseSchema.safeParse(response);
    expect(result.success).toBe(false);
  });
});
