import { describe, it, expect } from "vitest";
import { searchQueryOptions } from "../useSearch.js";
import { queryKeys } from "../../utils/constants.js";
import type { SearchQuery } from "../../types/index.js";

/**
 * Tests for `searchQueryOptions` — the shared TanStack Query options factory for search.
 *
 * These tests verify:
 * 1. Query key follows convention `['search', 'results', params]`
 * 2. staleTime is 120_000ms (2 minutes)
 * 3. Hook is disabled when query is empty or < 2 chars
 * 4. Hook is enabled when query >= 2 chars
 */

// Minimal mock SupabaseClient — only needs functions.invoke
const mockSupabaseClient = {
  functions: {
    invoke: async () => ({
      data: {
        data: { query: "test", products: [], total: 0, explanations: {} },
        error: null,
      },
      error: null,
    }),
  },
} as unknown as Parameters<typeof searchQueryOptions>[1];

describe("searchQueryOptions", () => {
  it("generates correct query key from queryKeys.search.results()", () => {
    const params: SearchQuery = { query: "gift for dad" };
    const options = searchQueryOptions(params, mockSupabaseClient);

    expect(options.queryKey).toEqual(
      queryKeys.search.results({ query: "gift for dad", filters: undefined }),
    );
    expect(options.queryKey).toEqual([
      "search",
      "results",
      { query: "gift for dad", filters: undefined },
    ]);
  });

  it("includes filters in query key", () => {
    const params: SearchQuery = {
      query: "shoes",
      filters: { category: "Footwear", minPrice: 5000 },
    };
    const options = searchQueryOptions(params, mockSupabaseClient);

    expect(options.queryKey).toEqual(
      queryKeys.search.results({
        query: "shoes",
        filters: { category: "Footwear", minPrice: 5000 },
      }),
    );
  });

  it("sets staleTime to 120_000ms (2 minutes)", () => {
    const options = searchQueryOptions({ query: "test query" }, mockSupabaseClient);
    expect(options.staleTime).toBe(120_000);
  });

  it("is enabled when query >= 2 chars", () => {
    const options = searchQueryOptions({ query: "ab" }, mockSupabaseClient);
    expect(options.enabled).toBe(true);
  });

  it("is enabled for longer queries", () => {
    const options = searchQueryOptions({ query: "wireless headphones" }, mockSupabaseClient);
    expect(options.enabled).toBe(true);
  });

  it("is disabled when query is empty", () => {
    const options = searchQueryOptions({ query: "" }, mockSupabaseClient);
    expect(options.enabled).toBe(false);
  });

  it("is disabled when query is single char", () => {
    const options = searchQueryOptions({ query: "a" }, mockSupabaseClient);
    expect(options.enabled).toBe(false);
  });
});
