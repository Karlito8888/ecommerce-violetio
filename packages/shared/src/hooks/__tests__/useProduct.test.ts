import { describe, it, expect, vi } from "vitest";
import { productDetailQueryOptions } from "../useProducts.js";
import { queryKeys } from "../../utils/constants.js";
import type { ApiResponse, Product } from "../../types/index.js";

/**
 * Tests for `productDetailQueryOptions` — the shared TanStack Query options
 * factory for the Product Detail Page.
 *
 * Verifies:
 * 1. Query key generation matches `queryKeys.products.detail()` convention
 * 2. staleTime is 5 minutes (consistent with catalog data caching policy)
 * 3. fetchFn is passed through correctly as queryFn
 * 4. Different productIds produce isolated cache entries
 */

function createMockFetchFn() {
  return vi.fn<(id: string) => Promise<ApiResponse<Product>>>().mockResolvedValue({
    data: {
      id: "prod-1",
      name: "Test Product",
      description: "A test product",
      htmlDescription: null,
      minPrice: 1999,
      maxPrice: 1999,
      currency: "USD",
      available: true,
      visible: true,
      status: "AVAILABLE",
      publishingStatus: "PUBLISHED",
      source: "SHOPIFY",
      seller: "Test Merchant",
      vendor: "TestBrand",
      type: "PHYSICAL",
      externalUrl: "https://example.com",
      merchantId: "m-1",
      productId: "p-1",
      commissionRate: 10,
      tags: [],
      dateCreated: "2024-01-01",
      dateLastModified: "2024-01-01",
      variants: [],
      skus: [],
      albums: [],
      images: [],
      thumbnailUrl: null,
    },
    error: null,
  });
}

describe("productDetailQueryOptions", () => {
  it("generates correct query key from queryKeys.products.detail()", () => {
    const mockFetch = createMockFetchFn();

    const options = productDetailQueryOptions("prod-42", mockFetch);

    expect(options.queryKey).toEqual(queryKeys.products.detail("prod-42"));
    expect(options.queryKey).toEqual(["products", "detail", "prod-42"]);
  });

  it("sets staleTime to 5 minutes (300000ms)", () => {
    const mockFetch = createMockFetchFn();

    const options = productDetailQueryOptions("prod-1", mockFetch);

    expect(options.staleTime).toBe(5 * 60 * 1000);
    expect(options.staleTime).toBe(300_000);
  });

  it("passes fetchFn as queryFn and calls it with productId", async () => {
    const mockFetch = createMockFetchFn();

    const options = productDetailQueryOptions("prod-99", mockFetch);
    await options.queryFn!({} as never);

    expect(mockFetch).toHaveBeenCalledOnce();
    expect(mockFetch).toHaveBeenCalledWith("prod-99");
  });

  it("returns different query keys for different productIds (cache isolation)", () => {
    const mockFetch = createMockFetchFn();

    const options1 = productDetailQueryOptions("prod-1", mockFetch);
    const options2 = productDetailQueryOptions("prod-2", mockFetch);

    expect(options1.queryKey).not.toEqual(options2.queryKey);
    expect(options1.queryKey[2]).toBe("prod-1");
    expect(options2.queryKey[2]).toBe("prod-2");
  });
});
