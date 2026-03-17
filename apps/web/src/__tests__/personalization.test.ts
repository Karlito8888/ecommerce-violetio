/**
 * Tests for search personalization logic (Story 6.3).
 *
 * Tests the pure functions extracted from the search-products Edge Function:
 * - extractCategory: parses category from text_content
 * - applyPersonalizationBoost: computes boosted scores and re-ranks
 */
import { describe, expect, it } from "vitest";

// ─── Pure function copies for testing ────────────────────────────
// These replicate the logic in supabase/functions/search-products/index.ts
// since Edge Function code (Deno) can't be directly imported in Node/Vitest.

interface CategoryAffinity {
  category: string;
  view_count: number;
}

interface UserSearchProfile {
  top_categories: CategoryAffinity[];
  avg_order_price: number;
  recent_product_ids: string[];
  total_events: number;
}

function extractCategory(textContent: string): string | null {
  const match = textContent.match(/Category:\s*([^.]+)/i);
  return match ? match[1].trim() : null;
}

function applyPersonalizationBoost(
  products: Array<Record<string, unknown>>,
  profile: UserSearchProfile,
  textContentMap: Map<string, string>,
): Array<Record<string, unknown>> {
  const categoryBoostMap = new Map<string, number>();
  const boostValues = [1.0, 0.7, 0.5, 0.3, 0.3];
  profile.top_categories.forEach((cat, i) => {
    categoryBoostMap.set(cat.category.toLowerCase(), boostValues[i] ?? 0.3);
  });

  const boosted = products.map((product) => {
    const textContent = textContentMap.get(product.id as string) ?? "";
    const originalSimilarity = product.similarity as number;

    const productCategory = extractCategory(textContent);
    const categoryBoost = productCategory
      ? (categoryBoostMap.get(productCategory.toLowerCase()) ?? 0)
      : 0;

    let priceProximity = 0.5;
    if (profile.avg_order_price > 0) {
      const productPrice = product.minPrice as number;
      const priceDiff = Math.abs(productPrice - profile.avg_order_price);
      priceProximity = Math.max(0, 1 - Math.min(priceDiff / profile.avg_order_price, 1));
    }

    const finalScore = originalSimilarity * 0.7 + categoryBoost * 0.2 + priceProximity * 0.1;

    return {
      ...product,
      similarity: Math.round(finalScore * 10000) / 10000,
    };
  });

  return boosted.sort((a, b) => (b.similarity as number) - (a.similarity as number));
}

// ─── Tests ───────────────────────────────────────────────────────

describe("extractCategory", () => {
  it("extracts category from standard text_content format", () => {
    const text = "Cool Gadget. A fun gadget. Brand: Acme. Category: Electronics. Tags: fun, tech";
    expect(extractCategory(text)).toBe("Electronics");
  });

  it("extracts category with extra spacing", () => {
    expect(extractCategory("Name. Category:   Home & Garden. Tags: x")).toBe("Home & Garden");
  });

  it("returns null when no category present", () => {
    expect(extractCategory("Name. Description. Brand: Acme. Tags: fun")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(extractCategory("")).toBeNull();
  });

  it("is case-insensitive", () => {
    expect(extractCategory("CATEGORY: Fashion")).toBe("Fashion");
  });
});

describe("applyPersonalizationBoost", () => {
  const baseProfile: UserSearchProfile = {
    top_categories: [
      { category: "Electronics", view_count: 15 },
      { category: "Books", view_count: 10 },
      { category: "Fashion", view_count: 5 },
    ],
    avg_order_price: 5000, // $50.00
    recent_product_ids: ["p1", "p2"],
    total_events: 30,
  };

  const makeProduct = (id: string, similarity: number, minPrice: number) => ({
    id,
    similarity,
    minPrice,
    name: `Product ${id}`,
  });

  const makeTextMap = (entries: Array<[string, string]>) => new Map(entries);

  it("boosts products matching top category (#1)", () => {
    const products = [makeProduct("a", 0.8, 5000)];
    const textMap = makeTextMap([["a", "Gadget. Category: Electronics. Tags: x"]]);

    const result = applyPersonalizationBoost(products, baseProfile, textMap);

    // 0.8*0.7 + 1.0*0.2 + 1.0*0.1 = 0.56 + 0.20 + 0.10 = 0.86
    expect(result[0].similarity).toBeCloseTo(0.86, 3);
  });

  it("applies lower boost for #2 category", () => {
    const products = [makeProduct("a", 0.8, 5000)];
    const textMap = makeTextMap([["a", "Novel. Category: Books. Tags: x"]]);

    const result = applyPersonalizationBoost(products, baseProfile, textMap);

    // 0.8*0.7 + 0.7*0.2 + 1.0*0.1 = 0.56 + 0.14 + 0.10 = 0.80
    expect(result[0].similarity).toBeCloseTo(0.8, 3);
  });

  it("gives zero category boost for unmatched category", () => {
    const products = [makeProduct("a", 0.8, 5000)];
    const textMap = makeTextMap([["a", "Widget. Category: Sports. Tags: x"]]);

    const result = applyPersonalizationBoost(products, baseProfile, textMap);

    // 0.8*0.7 + 0*0.2 + 1.0*0.1 = 0.56 + 0 + 0.10 = 0.66
    expect(result[0].similarity).toBeCloseTo(0.66, 3);
  });

  it("gives zero category boost when no category in text_content", () => {
    const products = [makeProduct("a", 0.8, 5000)];
    const textMap = makeTextMap([["a", "Widget. Brand: Acme. Tags: x"]]);

    const result = applyPersonalizationBoost(products, baseProfile, textMap);

    // 0.8*0.7 + 0*0.2 + 1.0*0.1 = 0.56 + 0.10 = 0.66
    expect(result[0].similarity).toBeCloseTo(0.66, 3);
  });

  it("computes price proximity = 1.0 when product matches avg price", () => {
    const products = [makeProduct("a", 0.8, 5000)];
    const textMap = makeTextMap([["a", "Gadget. Category: Electronics. Tags: x"]]);

    const result = applyPersonalizationBoost(products, baseProfile, textMap);

    // price_proximity = 1 - |5000 - 5000| / 5000 = 1.0
    // 0.8*0.7 + 1.0*0.2 + 1.0*0.1 = 0.86
    expect(result[0].similarity).toBeCloseTo(0.86, 3);
  });

  it("computes price proximity = 0.5 when product is at 2.5x avg price", () => {
    const products = [makeProduct("a", 0.8, 7500)]; // $75 vs avg $50
    const textMap = makeTextMap([["a", "Gadget. Category: Electronics. Tags: x"]]);

    const result = applyPersonalizationBoost(products, baseProfile, textMap);

    // price_proximity = 1 - |7500 - 5000| / 5000 = 1 - 0.5 = 0.5
    // 0.8*0.7 + 1.0*0.2 + 0.5*0.1 = 0.56 + 0.20 + 0.05 = 0.81
    expect(result[0].similarity).toBeCloseTo(0.81, 3);
  });

  it("uses neutral price proximity (0.5) when no order history", () => {
    const noOrderProfile = { ...baseProfile, avg_order_price: 0 };
    const products = [makeProduct("a", 0.8, 5000)];
    const textMap = makeTextMap([["a", "Gadget. Category: Electronics. Tags: x"]]);

    const result = applyPersonalizationBoost(products, noOrderProfile, textMap);

    // 0.8*0.7 + 1.0*0.2 + 0.5*0.1 = 0.56 + 0.20 + 0.05 = 0.81
    expect(result[0].similarity).toBeCloseTo(0.81, 3);
  });

  it("re-ranks products by boosted score descending", () => {
    const products = [
      makeProduct("low", 0.9, 50000), // high semantic but bad price/category
      makeProduct("high", 0.7, 5000), // lower semantic but perfect price + category
    ];
    const textMap = makeTextMap([
      ["low", "Expensive thing. Category: Sports. Tags: x"],
      ["high", "Gadget. Category: Electronics. Tags: x"],
    ]);

    const result = applyPersonalizationBoost(products, baseProfile, textMap);

    // low: 0.9*0.7 + 0*0.2 + 0*0.1 = 0.63 (bad price: 50000 vs 5000 = proximity 0)
    // high: 0.7*0.7 + 1.0*0.2 + 1.0*0.1 = 0.49 + 0.20 + 0.10 = 0.79
    expect(result[0].id).toBe("high");
    expect(result[1].id).toBe("low");
  });

  it("handles empty products array", () => {
    const result = applyPersonalizationBoost([], baseProfile, new Map());
    expect(result).toEqual([]);
  });

  it("handles empty text content map gracefully", () => {
    const products = [makeProduct("a", 0.8, 5000)];
    const result = applyPersonalizationBoost(products, baseProfile, new Map());

    // No text_content → no category boost, price proximity = 1.0
    // 0.8*0.7 + 0*0.2 + 1.0*0.1 = 0.66
    expect(result[0].similarity).toBeCloseTo(0.66, 3);
  });

  it("handles profile with no categories", () => {
    const emptyProfile: UserSearchProfile = {
      top_categories: [],
      avg_order_price: 5000,
      recent_product_ids: [],
      total_events: 5,
    };
    const products = [makeProduct("a", 0.8, 5000)];
    const textMap = makeTextMap([["a", "Gadget. Category: Electronics. Tags: x"]]);

    const result = applyPersonalizationBoost(products, emptyProfile, textMap);

    // 0.8*0.7 + 0*0.2 + 1.0*0.1 = 0.66
    expect(result[0].similarity).toBeCloseTo(0.66, 3);
  });
});
