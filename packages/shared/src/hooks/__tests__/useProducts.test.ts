import { describe, it, expect, vi } from "vitest";
import { productsQueryOptions } from "../useProducts.js";
import { queryKeys } from "../../utils/constants.js";
import type { ApiResponse, PaginatedResult, Product, ProductQuery } from "../../types/index.js";

/**
 * Tests for `productsQueryOptions` — the shared TanStack Query options factory.
 *
 * These tests verify:
 * 1. Query key generation matches `queryKeys.products.list()` convention
 * 2. staleTime is 5 minutes (catalog data caching policy)
 * 3. fetchFn is passed through correctly as queryFn
 */

function createMockFetchFn() {
  return vi
    .fn<(params: ProductQuery) => Promise<ApiResponse<PaginatedResult<Product>>>>()
    .mockResolvedValue({
      data: { data: [], total: 0, page: 1, pageSize: 12, hasNext: false },
      error: null,
    });
}

describe("productsQueryOptions", () => {
  it("generates correct query key from queryKeys.products.list()", () => {
    const params: ProductQuery = { category: "Home", page: 2, pageSize: 12 };
    const mockFetch = createMockFetchFn();

    const options = productsQueryOptions(params, mockFetch);

    expect(options.queryKey).toEqual(queryKeys.products.list(params));
    expect(options.queryKey).toEqual(["products", "list", params]);
  });

  it("generates correct query key without params", () => {
    const params: ProductQuery = {};
    const mockFetch = createMockFetchFn();

    const options = productsQueryOptions(params, mockFetch);

    expect(options.queryKey).toEqual(["products", "list", {}]);
  });

  it("sets staleTime to 5 minutes (300000ms)", () => {
    const mockFetch = createMockFetchFn();

    const options = productsQueryOptions({}, mockFetch);

    expect(options.staleTime).toBe(5 * 60 * 1000);
    expect(options.staleTime).toBe(300_000);
  });

  it("passes fetchFn as queryFn and calls it with params", async () => {
    const params: ProductQuery = { category: "Beauty", page: 1 };
    const mockFetch = createMockFetchFn();

    const options = productsQueryOptions(params, mockFetch);
    await options.queryFn!({} as never);

    expect(mockFetch).toHaveBeenCalledOnce();
    expect(mockFetch).toHaveBeenCalledWith(params);
  });

  it("returns different query keys for different params (cache isolation)", () => {
    const mockFetch = createMockFetchFn();

    const options1 = productsQueryOptions({ category: "Home", page: 1 }, mockFetch);
    const options2 = productsQueryOptions({ category: "Beauty", page: 1 }, mockFetch);
    const options3 = productsQueryOptions({ category: "Home", page: 2 }, mockFetch);

    expect(options1.queryKey).not.toEqual(options2.queryKey);
    expect(options1.queryKey).not.toEqual(options3.queryKey);
  });
});
