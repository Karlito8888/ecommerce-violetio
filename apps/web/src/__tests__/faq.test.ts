/**
 * Tests for FAQ client-side filtering.
 *
 * filterFaq is a pure function used by the help page to filter FAQ items
 * by search query. The Supabase-backed getFaqItems tests have been replaced
 * by convex/__tests__/content.test.ts (Convex query getFaqItems).
 */
import { describe, expect, it } from "vitest";
import { filterFaq } from "../utils/faqFilter";
import type { FaqCategory } from "@ecommerce/shared";

const sampleFaq: FaqCategory[] = [
  {
    name: "Shipping",
    items: [
      {
        id: "1",
        category: "shipping",
        question: "How long does shipping take?",
        answerMarkdown: "Standard shipping takes 5-7 business days.",
        sortOrder: 0,
        isPublished: true,
        createdAt: "2026-01-01",
        updatedAt: "2026-01-01",
      },
      {
        id: "2",
        category: "shipping",
        question: "Do you ship internationally?",
        answerMarkdown: "Yes, we ship to select countries.",
        sortOrder: 1,
        createdAt: "2026-01-01",
        updatedAt: "2026-01-01",
        isPublished: true,
      },
    ],
  },
  {
    name: "Returns",
    items: [
      {
        id: "3",
        category: "returns",
        question: "What is your return policy?",
        answerMarkdown: "You can return items within 30 days.",
        sortOrder: 0,
        isPublished: true,
        createdAt: "2026-01-01",
        updatedAt: "2026-01-01",
      },
    ],
  },
];

describe("FAQ search filtering (filterFaq)", () => {
  it("returns all categories when query is empty", () => {
    const { filtered } = filterFaq(sampleFaq, "");
    expect(filtered).toHaveLength(2);
  });

  it("filters by question text", () => {
    const { filtered } = filterFaq(sampleFaq, "international");
    expect(filtered).toHaveLength(1);
    expect(filtered[0].name).toBe("Shipping");
    expect(filtered[0].items).toHaveLength(1);
  });

  it("filters by answer text", () => {
    const { filtered } = filterFaq(sampleFaq, "30 days");
    expect(filtered).toHaveLength(1);
    expect(filtered[0].name).toBe("Returns");
  });

  it("is case-insensitive", () => {
    const { filtered } = filterFaq(sampleFaq, "SHIPPING");
    expect(filtered.length).toBeGreaterThanOrEqual(1);
  });

  it("returns empty when no matches", () => {
    const { filtered } = filterFaq(sampleFaq, "xyznotfound123");
    expect(filtered).toHaveLength(0);
  });
});
