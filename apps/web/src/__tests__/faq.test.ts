import { describe, expect, it, vi } from "vitest";

/**
 * Test the getFaqItems function from the shared FAQ client.
 * Uses a mock Supabase client (same pattern as content tests).
 */

import { getFaqItems } from "@ecommerce/shared";
import type { SupabaseClient } from "@supabase/supabase-js";
import { filterFaq } from "../utils/faqFilter";

/** Build a mock Supabase client that returns given data. */
function buildMockClient(data: unknown[] | null, error: unknown = null): SupabaseClient {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    then: undefined as unknown,
  };

  // Make the chain thenable (resolves like a promise)
  Object.defineProperty(chain, "then", {
    value: (resolve: (val: unknown) => void) => resolve({ data, error }),
  });

  // Actually mock `.order()` to return the chain on second call
  let orderCallCount = 0;
  chain.order = vi.fn().mockImplementation(() => {
    orderCallCount++;
    if (orderCallCount >= 2) {
      // Second .order() call returns the final promise-like chain
      return { data, error };
    }
    return chain;
  });

  return { from: vi.fn().mockReturnValue(chain) } as unknown as SupabaseClient;
}

// Sample FAQ data matching the DB row shape (snake_case)
const sampleRows = [
  {
    id: "id-1",
    category: "Shipping & Delivery",
    question: "How long does shipping take?",
    answer_markdown: "Most orders ship within **2-5 business days**.",
    sort_order: 10,
    is_published: true,
    created_at: "2026-03-20T00:00:00Z",
    updated_at: "2026-03-20T00:00:00Z",
  },
  {
    id: "id-2",
    category: "Shipping & Delivery",
    question: "Do you ship internationally?",
    answer_markdown: "Currently US and Canada only.",
    sort_order: 20,
    is_published: true,
    created_at: "2026-03-20T00:00:00Z",
    updated_at: "2026-03-20T00:00:00Z",
  },
  {
    id: "id-3",
    category: "Payment Methods",
    question: "What payment methods do you accept?",
    answer_markdown: "Visa, Mastercard, Amex, Discover via Stripe.",
    sort_order: 10,
    is_published: true,
    created_at: "2026-03-20T00:00:00Z",
    updated_at: "2026-03-20T00:00:00Z",
  },
  {
    id: "id-4",
    category: "Returns & Refunds",
    question: "What is your return policy?",
    answer_markdown: "Most merchants accept returns within 30 days.",
    sort_order: 10,
    is_published: true,
    created_at: "2026-03-20T00:00:00Z",
    updated_at: "2026-03-20T00:00:00Z",
  },
];

describe("getFaqItems", () => {
  it("returns FAQ items grouped by category in canonical order", async () => {
    const client = buildMockClient(sampleRows);
    const result = await getFaqItems(client);

    expect(result).toHaveLength(3);
    // Canonical order: Shipping & Delivery first, then Returns & Refunds, then Payment Methods
    expect(result[0].name).toBe("Shipping & Delivery");
    expect(result[1].name).toBe("Returns & Refunds");
    expect(result[2].name).toBe("Payment Methods");
  });

  it("maps snake_case DB rows to camelCase FaqItem", async () => {
    const client = buildMockClient([sampleRows[0]]);
    const result = await getFaqItems(client);

    expect(result[0].items[0]).toEqual({
      id: "id-1",
      category: "Shipping & Delivery",
      question: "How long does shipping take?",
      answerMarkdown: "Most orders ship within **2-5 business days**.",
      sortOrder: 10,
      isPublished: true,
      createdAt: "2026-03-20T00:00:00Z",
      updatedAt: "2026-03-20T00:00:00Z",
    });
  });

  it("groups multiple items within the same category", async () => {
    const client = buildMockClient(sampleRows);
    const result = await getFaqItems(client);

    const shippingCategory = result.find((c) => c.name === "Shipping & Delivery");
    expect(shippingCategory?.items).toHaveLength(2);
    expect(shippingCategory?.items[0].question).toBe("How long does shipping take?");
    expect(shippingCategory?.items[1].question).toBe("Do you ship internationally?");
  });

  it("returns empty array when no data returned", async () => {
    const client = buildMockClient(null);
    const result = await getFaqItems(client);
    expect(result).toEqual([]);
  });

  it("returns empty array on error", async () => {
    const client = buildMockClient(null, { message: "DB error" });
    const result = await getFaqItems(client);
    expect(result).toEqual([]);
  });

  it("appends non-canonical categories at the end", async () => {
    const customRows = [
      ...sampleRows,
      {
        id: "id-5",
        category: "Custom Category",
        question: "Custom question?",
        answer_markdown: "Custom answer",
        sort_order: 10,
        is_published: true,
        created_at: "2026-03-20T00:00:00Z",
        updated_at: "2026-03-20T00:00:00Z",
      },
    ];
    const client = buildMockClient(customRows);
    const result = await getFaqItems(client);

    // Custom category should come after all canonical categories
    const lastCategory = result[result.length - 1];
    expect(lastCategory.name).toBe("Custom Category");
    expect(lastCategory.items[0].question).toBe("Custom question?");
  });

  it("calls Supabase with correct query parameters", async () => {
    const fromMock = vi.fn();
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
    };
    let orderCallCount = 0;
    chain.order = vi.fn().mockImplementation(() => {
      orderCallCount++;
      if (orderCallCount >= 2) return { data: [], error: null };
      return chain;
    });
    chain.select.mockReturnValue(chain);
    chain.eq.mockReturnValue(chain);
    fromMock.mockReturnValue(chain);

    const client = { from: fromMock } as unknown as SupabaseClient;
    await getFaqItems(client);

    expect(fromMock).toHaveBeenCalledWith("faq_items");
    expect(chain.select).toHaveBeenCalledWith("*");
    expect(chain.eq).toHaveBeenCalledWith("is_published", true);
    expect(chain.order).toHaveBeenCalledTimes(2);
    expect(chain.order).toHaveBeenCalledWith("category");
    expect(chain.order).toHaveBeenCalledWith("sort_order", { ascending: true });
  });
});

describe("FAQ search filtering (filterFaq)", () => {
  const baseFaqItem = {
    category: "",
    sortOrder: 10,
    isPublished: true,
    createdAt: "2026-03-20T00:00:00Z",
    updatedAt: "2026-03-20T00:00:00Z",
  };

  const testCategories = [
    {
      name: "Shipping",
      items: [
        {
          ...baseFaqItem,
          id: "1",
          question: "How long does shipping take?",
          answerMarkdown: "2-5 days",
        },
        {
          ...baseFaqItem,
          id: "2",
          question: "International shipping?",
          answerMarkdown: "US and Canada",
        },
      ],
    },
    {
      name: "Payment",
      items: [
        {
          ...baseFaqItem,
          id: "3",
          question: "What cards accepted?",
          answerMarkdown: "Visa, Mastercard",
        },
      ],
    },
  ];

  it("returns all categories when query is empty", () => {
    const { filtered } = filterFaq(testCategories, "");
    expect(filtered).toEqual(testCategories);
  });

  it("filters by question text", () => {
    const { filtered, matchedIds } = filterFaq(testCategories, "international");
    expect(filtered).toHaveLength(1);
    expect(filtered[0].name).toBe("Shipping");
    expect(filtered[0].items).toHaveLength(1);
    expect(matchedIds.has("2")).toBe(true);
  });

  it("filters by answer text", () => {
    const { filtered } = filterFaq(testCategories, "Visa");
    expect(filtered).toHaveLength(1);
    expect(filtered[0].name).toBe("Payment");
  });

  it("is case-insensitive", () => {
    const { filtered } = filterFaq(testCategories, "SHIPPING");
    expect(filtered).toHaveLength(1);
    expect(filtered[0].items).toHaveLength(2);
  });

  it("returns empty when no matches", () => {
    const { filtered } = filterFaq(testCategories, "nonexistent");
    expect(filtered).toHaveLength(0);
  });
});
