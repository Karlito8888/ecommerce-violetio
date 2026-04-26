import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { VioletAdapter, _resetCategoriesCache } from "../violetAdapter.js";
import { createSupplierAdapter } from "../adapterFactory.js";
import type { VioletTokenManager } from "../../clients/violetAuth.js";
import type { VioletOfferResponse, VioletSkuResponse } from "../../types/index.js";

// ─── Test fixtures ──────────────────────────────────────────────────

function createMockTokenManager(): VioletTokenManager {
  return {
    getAuthHeaders: vi.fn().mockResolvedValue({
      data: {
        "X-Violet-Token": "test-token",
        "X-Violet-App-Id": "test-app-id",
        "X-Violet-App-Secret": "test-secret",
      },
      error: null,
    }),
    getValidToken: vi.fn(),
    invalidateToken: vi.fn(),
    config: {},
  } as unknown as VioletTokenManager;
}

function createMockSku(overrides: Partial<VioletSkuResponse> = {}): VioletSkuResponse {
  return {
    id: 100,
    offer_id: 1,
    merchant_id: 10,
    name: "Small / Red",
    in_stock: true,
    qty_available: 25,
    sale_price: 1999,
    retail_price: 2499,
    currency: "USD",
    taxable: true,
    type: "PHYSICAL",
    status: "AVAILABLE",
    variant_values: [
      { variant: "Size", value: "Small" },
      { variant: "Color", value: "Red" },
    ],
    sku_dimensions: { weight: 0.5, type: "lb" },
    albums: [],
    date_created: "2026-01-15T10:00:00Z",
    date_last_modified: "2026-02-20T14:30:00Z",
    ...overrides,
  };
}

function createMockOffer(overrides: Partial<VioletOfferResponse> = {}): VioletOfferResponse {
  return {
    id: 1,
    name: "Test Product",
    description: "A test product description",
    html_description: "<p>A test product</p>",
    min_price: 1999,
    max_price: 4999,
    currency: "USD",
    available: true,
    visible: true,
    status: "AVAILABLE",
    publishing_status: "PUBLISHED",
    source: "SHOPIFY",
    seller: "Test Store",
    vendor: "Test Brand",
    type: "PHYSICAL",
    external_url: "https://example.com/product",
    merchant_id: 10,
    product_id: "ext-prod-123",
    commission_rate: 15,
    tags: ["sale", "new"],
    date_created: "2026-01-15T10:00:00Z",
    date_last_modified: "2026-02-20T14:30:00Z",
    variants: [{ name: "Size", values: ["Small", "Large"] }],
    skus: [createMockSku()],
    albums: [
      {
        id: 200,
        type: "OFFER",
        name: "Main",
        media: [
          {
            id: 300,
            url: "https://cdn.example.com/img1.jpg",
            source_url: "https://source.example.com/img1.jpg",
            type: "IMAGE",
            display_order: 1,
            primary: true,
          },
        ],
        primary_media: {
          id: 300,
          url: "https://cdn.example.com/img1.jpg",
          source_url: "https://source.example.com/img1.jpg",
          type: "IMAGE",
          display_order: 1,
          primary: true,
        },
      },
    ],
    ...overrides,
  };
}

function createPaginatedResponse(offers: VioletOfferResponse[], page = 0, totalPages = 1) {
  return {
    content: offers,
    total_elements: offers.length,
    total_pages: totalPages,
    number: page,
    size: 20,
    number_of_elements: offers.length,
    first: page === 0,
    last: page === totalPages - 1,
    empty: offers.length === 0,
  };
}

function mockFetchResponse(body: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  });
}

// ─── Tests ──────────────────────────────────────────────────────────

describe("VioletAdapter", () => {
  let adapter: VioletAdapter;
  let tokenManager: VioletTokenManager;

  beforeEach(() => {
    tokenManager = createMockTokenManager();
    adapter = new VioletAdapter(tokenManager, "https://test-api.violet.io/v1");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("transformOffer (via getProduct)", () => {
    it("correctly maps all Violet snake_case fields to camelCase Product", async () => {
      const offer = createMockOffer();
      vi.stubGlobal("fetch", mockFetchResponse(offer));

      const result = await adapter.getProduct("1");
      expect(result.error).toBeNull();

      const product = result.data!;
      expect(product.id).toBe("1");
      expect(product.name).toBe("Test Product");
      expect(product.htmlDescription).toBe("<p>A test product</p>");
      expect(product.minPrice).toBe(1999);
      expect(product.maxPrice).toBe(4999);
      expect(product.currency).toBe("USD");
      expect(product.available).toBe(true);
      expect(product.visible).toBe(true);
      expect(product.status).toBe("AVAILABLE");
      expect(product.publishingStatus).toBe("PUBLISHED");
      expect(product.source).toBe("SHOPIFY");
      expect(product.seller).toBe("Test Store");
      expect(product.vendor).toBe("Test Brand");
      expect(product.type).toBe("PHYSICAL");
      expect(product.externalUrl).toBe("https://example.com/product");
      expect(product.merchantId).toBe("10");
      expect(product.productId).toBe("ext-prod-123");
      expect(product.commissionRate).toBe(15);
      expect(product.tags).toEqual(["sale", "new"]);
      expect(product.dateCreated).toBe("2026-01-15T10:00:00Z");
      expect(product.dateLastModified).toBe("2026-02-20T14:30:00Z");
      expect(product.variants).toEqual([{ name: "Size", values: ["Small", "Large"] }]);
      expect(product.thumbnailUrl).toBe("https://cdn.example.com/img1.jpg");
    });

    it("converts numeric IDs to strings", async () => {
      const offer = createMockOffer({ id: 42, merchant_id: 99 });
      vi.stubGlobal("fetch", mockFetchResponse(offer));

      const result = await adapter.getProduct("42");
      expect(result.data!.id).toBe("42");
      expect(result.data!.merchantId).toBe("99");
    });

    it("handles null html_description", async () => {
      const offer = createMockOffer({ html_description: null });
      vi.stubGlobal("fetch", mockFetchResponse(offer));

      const result = await adapter.getProduct("1");
      expect(result.data!.htmlDescription).toBeNull();
    });

    it("returns null thumbnailUrl when no albums exist (M3 fix)", async () => {
      const offer = createMockOffer({ albums: [] });
      vi.stubGlobal("fetch", mockFetchResponse(offer));

      const result = await adapter.getProduct("1");
      expect(result.data!.thumbnailUrl).toBeNull();
    });

    /**
     * C1 fix: Violet excludes null-valued properties from responses.
     * The adapter must handle offers with missing optional fields.
     */
    it("handles Violet null-exclusion (offer with minimal fields)", async () => {
      const minimalOffer = { id: 1, name: "Minimal", merchant_id: 10 };
      vi.stubGlobal("fetch", mockFetchResponse(minimalOffer));

      const result = await adapter.getProduct("1");
      expect(result.error).toBeNull();

      const product = result.data!;
      expect(product.id).toBe("1");
      expect(product.name).toBe("Minimal");
      expect(product.description).toBe("");
      expect(product.htmlDescription).toBeNull();
      expect(product.minPrice).toBe(0);
      expect(product.currency).toBe("USD");
      expect(product.tags).toEqual([]);
      expect(product.variants).toEqual([]);
      expect(product.skus).toEqual([]);
      expect(product.albums).toEqual([]);
      expect(product.thumbnailUrl).toBeNull();
    });

    /**
     * C3 fix: Violet docs show { name, value } for variant_values
     * but some API versions return { variant, value }. Test both.
     */
    it("handles variant_values with 'name' field instead of 'variant' (C3 fix)", async () => {
      const offer = createMockOffer({
        skus: [
          createMockSku({
            variant_values: [{ name: "Size", value: "Large" }],
          }),
        ],
      });
      vi.stubGlobal("fetch", mockFetchResponse(offer));

      const result = await adapter.getProduct("1");
      expect(result.data!.skus[0]!.variantValues).toEqual([{ variant: "Size", value: "Large" }]);
    });

    // Contextual pricing
    it("appends base_currency to single offer URL when countryCode resolves to non-USD", async () => {
      const offer = createMockOffer();
      const fetchMock = mockFetchResponse(offer);
      vi.stubGlobal("fetch", fetchMock);

      await adapter.getProduct("1", "GB"); // GB → GBP

      const calledUrl = fetchMock.mock.calls[0]![0] as string;
      expect(calledUrl).toContain("base_currency=GBP");
    });
  });

  describe("transformSku (via getProduct)", () => {
    it("correctly maps SKU fields from snake_case to camelCase", async () => {
      const offer = createMockOffer();
      vi.stubGlobal("fetch", mockFetchResponse(offer));

      const result = await adapter.getProduct("1");
      const sku = result.data!.skus[0]!;

      expect(sku.id).toBe("100");
      expect(sku.offerId).toBe("1");
      expect(sku.merchantId).toBe("10");
      expect(sku.name).toBe("Small / Red");
      expect(sku.inStock).toBe(true);
      expect(sku.qtyAvailable).toBe(25);
      expect(sku.salePrice).toBe(1999);
      expect(sku.retailPrice).toBe(2499);
      expect(sku.currency).toBe("USD");
      expect(sku.taxable).toBe(true);
      expect(sku.type).toBe("PHYSICAL");
      expect(sku.variantValues).toEqual([
        { variant: "Size", value: "Small" },
        { variant: "Color", value: "Red" },
      ]);
      expect(sku.dimensions).toEqual({ weight: 0.5, type: "lb" });
      expect(sku.dateCreated).toBe("2026-01-15T10:00:00Z");
      expect(sku.dateLastModified).toBe("2026-02-20T14:30:00Z");
    });

    it("handles null sku_dimensions", async () => {
      const offer = createMockOffer({
        skus: [createMockSku({ sku_dimensions: null })],
      });
      vi.stubGlobal("fetch", mockFetchResponse(offer));

      const result = await adapter.getProduct("1");
      expect(result.data!.skus[0]!.dimensions).toBeNull();
    });
  });

  describe("getProducts (pagination)", () => {
    it("transforms Violet 0-based pagination to 1-based", async () => {
      const paginated = createPaginatedResponse([createMockOffer()], 0, 3);
      vi.stubGlobal("fetch", mockFetchResponse(paginated));

      const result = await adapter.getProducts({ page: 1, pageSize: 20 });
      expect(result.error).toBeNull();
      expect(result.data!.page).toBe(1);
      expect(result.data!.hasNext).toBe(true);
      expect(result.data!.total).toBe(1);
      expect(result.data!.data).toHaveLength(1);
    });

    it("sends correct query params for page 2", async () => {
      const paginated = createPaginatedResponse([], 1, 3);
      const fetchMock = mockFetchResponse(paginated);
      vi.stubGlobal("fetch", fetchMock);

      await adapter.getProducts({ page: 2, pageSize: 10 });

      const calledUrl = fetchMock.mock.calls[0]![0] as string;
      expect(calledUrl).toContain("page=1"); // Internal page 2 → Violet page 1
      expect(calledUrl).toContain("size=10");
    });

    it("sets hasNext=false on last page", async () => {
      const paginated = createPaginatedResponse([createMockOffer()], 2, 3);
      vi.stubGlobal("fetch", mockFetchResponse(paginated));

      const result = await adapter.getProducts({ page: 3 });
      expect(result.data!.hasNext).toBe(false);
    });

    /**
     * L3 fix: verify that search filters (query, category, merchantId)
     * are correctly sent in the POST body.
     */
    it("sends search filters in POST body", async () => {
      const paginated = createPaginatedResponse([], 0, 1);
      const fetchMock = mockFetchResponse(paginated);
      vi.stubGlobal("fetch", fetchMock);

      await adapter.getProducts({
        query: "red shoes",
        category: "footwear",
        merchantId: "42",
      });

      const callArgs = fetchMock.mock.calls[0]!;
      const requestInit = callArgs[1] as RequestInit;
      const body = JSON.parse(requestInit.body as string);

      expect(body.query).toBe("red shoes");
      expect(body.category).toBe("footwear");
      expect(body.merchant_id).toBe(42); // converted to number
    });

    // ─── Contextual Pricing ───────────────────────────────────────
    // @see https://docs.violet.io/prism/catalog/contextual-pricing

    it("appends base_currency to search URL when countryCode resolves to non-USD currency", async () => {
      const paginated = createPaginatedResponse([createMockOffer()], 0, 1);
      const fetchMock = mockFetchResponse(paginated);
      vi.stubGlobal("fetch", fetchMock);

      // countryCode "FR" → currency "EUR" → should add base_currency=EUR
      await adapter.getProducts({ page: 1, pageSize: 10 }, "FR");

      const calledUrl = fetchMock.mock.calls[0]![0] as string;
      expect(calledUrl).toContain("base_currency=EUR");
    });

    it("does not append base_currency when countryCode resolves to USD", async () => {
      const paginated = createPaginatedResponse([createMockOffer()], 0, 1);
      const fetchMock = mockFetchResponse(paginated);
      vi.stubGlobal("fetch", fetchMock);

      await adapter.getProducts({ page: 1, pageSize: 10 }, "US");

      const calledUrl = fetchMock.mock.calls[0]![0] as string;
      expect(calledUrl).not.toContain("base_currency");
    });

    it("does not append base_currency when no countryCode is provided", async () => {
      const paginated = createPaginatedResponse([createMockOffer()], 0, 1);
      const fetchMock = mockFetchResponse(paginated);
      vi.stubGlobal("fetch", fetchMock);

      await adapter.getProducts({ page: 1, pageSize: 10 });

      const calledUrl = fetchMock.mock.calls[0]![0] as string;
      expect(calledUrl).not.toContain("base_currency");
    });
  });

  describe("Zod validation", () => {
    it("rejects malformed Violet response with VALIDATION_ERROR", async () => {
      const badResponse = { id: "not-a-number", name: 123 };
      vi.stubGlobal("fetch", mockFetchResponse(badResponse));

      const result = await adapter.getProduct("1");
      expect(result.data).toBeNull();
      expect(result.error!.code).toBe("VIOLET.VALIDATION_ERROR");
    });

    it("rejects paginated response with invalid offer", async () => {
      const badPaginated = createPaginatedResponse([
        { bad: "data" } as unknown as VioletOfferResponse,
      ]);
      vi.stubGlobal("fetch", mockFetchResponse(badPaginated));

      const result = await adapter.getProducts({});
      expect(result.data).toBeNull();
      expect(result.error!.code).toBe("VIOLET.VALIDATION_ERROR");
    });

    /**
     * C1 fix: Violet may send responses missing many optional fields.
     * The Zod schema should accept minimal responses and provide defaults.
     */
    it("accepts minimal offer response (only required fields)", async () => {
      const minimal = { id: 99, name: "Bare Minimum", merchant_id: 1 };
      vi.stubGlobal("fetch", mockFetchResponse(minimal));

      const result = await adapter.getProduct("99");
      expect(result.error).toBeNull();
      expect(result.data!.id).toBe("99");
      expect(result.data!.name).toBe("Bare Minimum");
    });
  });

  describe("error mapping", () => {
    it("maps 429 to VIOLET.RATE_LIMITED after retries exhausted", async () => {
      vi.useFakeTimers();
      const fetchMock = mockFetchResponse({}, 429);
      vi.stubGlobal("fetch", fetchMock);

      const promise = adapter.getProduct("1");

      // Advance through all retry delays: 1s + 2s + 4s
      await vi.advanceTimersByTimeAsync(1000);
      await vi.advanceTimersByTimeAsync(2000);
      await vi.advanceTimersByTimeAsync(4000);

      const result = await promise;
      expect(result.data).toBeNull();
      expect(result.error!.code).toBe("VIOLET.RATE_LIMITED");
      vi.useRealTimers();
    });

    it("maps 401 to VIOLET.AUTH_FAILED", async () => {
      vi.stubGlobal("fetch", mockFetchResponse({}, 401));

      const result = await adapter.getProduct("1");
      expect(result.error!.code).toBe("VIOLET.AUTH_FAILED");
    });

    it("maps 403 to VIOLET.AUTH_FAILED", async () => {
      vi.stubGlobal("fetch", mockFetchResponse({}, 403));

      const result = await adapter.getProduct("1");
      expect(result.error!.code).toBe("VIOLET.AUTH_FAILED");
    });

    it("maps 404 to VIOLET.NOT_FOUND", async () => {
      vi.stubGlobal("fetch", mockFetchResponse({}, 404));

      const result = await adapter.getProduct("1");
      expect(result.error!.code).toBe("VIOLET.NOT_FOUND");
    });

    it("maps 500 to VIOLET.API_ERROR", async () => {
      vi.stubGlobal("fetch", mockFetchResponse({}, 500));

      const result = await adapter.getProduct("1");
      expect(result.error!.code).toBe("VIOLET.API_ERROR");
    });

    it("maps network errors to VIOLET.NETWORK_ERROR", async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("fetch failed")));

      // Network errors also retry, use fake timers
      vi.useFakeTimers();
      const promise = adapter.getProduct("1");
      await vi.advanceTimersByTimeAsync(1000);
      await vi.advanceTimersByTimeAsync(2000);
      await vi.advanceTimersByTimeAsync(4000);

      const result = await promise;
      expect(result.data).toBeNull();
      expect(result.error!.code).toBe("VIOLET.NETWORK_ERROR");
      expect(result.error!.message).toBe("fetch failed");
      vi.useRealTimers();
    });

    it("propagates auth header errors", async () => {
      (tokenManager.getAuthHeaders as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: null,
        error: { code: "VIOLET.AUTH_FAILED", message: "Token expired" },
      });

      const result = await adapter.getProduct("1");
      expect(result.error!.code).toBe("VIOLET.AUTH_FAILED");
    });

    /**
     * L1 fix: JSON parse errors on successful responses should NOT
     * trigger retries — the server already responded successfully,
     * retrying won't change the response body.
     */
    it("returns VIOLET.API_ERROR on JSON parse failure without retrying (L1 fix)", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.reject(new SyntaxError("Unexpected token")),
        text: () => Promise.resolve("not json"),
      });
      vi.stubGlobal("fetch", fetchMock);

      const result = await adapter.getProduct("1");
      expect(result.data).toBeNull();
      expect(result.error!.code).toBe("VIOLET.API_ERROR");
      expect(result.error!.message).toContain("not valid JSON");
      // Should NOT have retried — only 1 fetch call
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("exponential backoff", () => {
    it("retries on 429 with increasing delays", async () => {
      vi.useFakeTimers();
      let callCount = 0;
      vi.stubGlobal(
        "fetch",
        vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount <= 3) {
            return Promise.resolve({
              ok: false,
              status: 429,
              text: () => Promise.resolve("Rate limited"),
            });
          }
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve(createMockOffer()),
          });
        }),
      );

      const promise = adapter.getProduct("1");

      // 1st retry after 1s
      await vi.advanceTimersByTimeAsync(1000);
      // 2nd retry after 2s
      await vi.advanceTimersByTimeAsync(2000);
      // 3rd retry after 4s — this one succeeds
      await vi.advanceTimersByTimeAsync(4000);

      const result = await promise;
      expect(result.error).toBeNull();
      expect(result.data!.name).toBe("Test Product");
      expect(callCount).toBe(4); // initial + 3 retries
      vi.useRealTimers();
    });

    it("stops retrying after max retries", async () => {
      vi.useFakeTimers();
      const fetchMock = mockFetchResponse({}, 429);
      vi.stubGlobal("fetch", fetchMock);

      const promise = adapter.getProduct("1");
      await vi.advanceTimersByTimeAsync(1000);
      await vi.advanceTimersByTimeAsync(2000);
      await vi.advanceTimersByTimeAsync(4000);

      const result = await promise;
      expect(result.error!.code).toBe("VIOLET.RATE_LIMITED");
      // initial call + 3 retries = 4 total calls
      expect(fetchMock).toHaveBeenCalledTimes(4);
      vi.useRealTimers();
    });
  });

  describe("HTTP request behavior", () => {
    /**
     * M2 fix: Content-Type should only be sent for requests with a body.
     * GET requests should not include Content-Type.
     */
    it("does not send Content-Type on GET requests (M2 fix)", async () => {
      const fetchMock = mockFetchResponse(createMockOffer());
      vi.stubGlobal("fetch", fetchMock);

      await adapter.getProduct("1");

      const callArgs = fetchMock.mock.calls[0]!;
      const requestInit = callArgs[1] as RequestInit;
      const headers = requestInit.headers as Record<string, string>;

      expect(headers["Content-Type"]).toBeUndefined();
      expect(headers["X-Violet-Token"]).toBe("test-token");
    });

    it("sends Content-Type on POST requests", async () => {
      const fetchMock = mockFetchResponse(createPaginatedResponse([]));
      vi.stubGlobal("fetch", fetchMock);

      await adapter.getProducts({});

      const callArgs = fetchMock.mock.calls[0]!;
      const requestInit = callArgs[1] as RequestInit;
      const headers = requestInit.headers as Record<string, string>;

      expect(headers["Content-Type"]).toBe("application/json");
    });
  });
});

describe("createSupplierAdapter", () => {
  it('returns VioletAdapter for "violet" supplier', () => {
    const adapter = createSupplierAdapter({
      supplier: "violet",
      violet: {
        appId: "test",
        appSecret: "secret",
        username: "user",
        password: "pass",
        apiBase: "https://test.violet.io/v1",
      },
    });
    expect(adapter).toBeInstanceOf(VioletAdapter);
  });

  it("throws for unknown supplier", () => {
    expect(() => createSupplierAdapter({ supplier: "unknown" })).toThrow(
      'Unsupported supplier: "unknown"',
    );
  });

  it("throws when violet config is missing", () => {
    expect(() => createSupplierAdapter({ supplier: "violet" })).toThrow("Violet adapter requires");
  });
});

// ─── getCategories / deriveCategoriesFromOffers ─────────────────────────

describe("VioletAdapter.getCategories", () => {
  let adapter: VioletAdapter;
  let tokenManager: VioletTokenManager;

  beforeEach(() => {
    tokenManager = createMockTokenManager();
    adapter = new VioletAdapter(tokenManager, "https://test-api.violet.io/v1");
    // Reset module-level cache between tests
    _resetCategoriesCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 'All' + categories derived from source_category_name on offers", async () => {
    const fetchMock = mockFetchResponse({
      content: [
        { source_category_name: "Clothing" },
        { source_category_name: "Electronics" },
        { source_category_name: "Clothing" }, // duplicate
        { source_category_name: "Home" },
      ],
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await adapter.getCategories();
    expect(result.error).toBeNull();
    expect(result.data).toBeDefined();

    // First item is always "All"
    expect(result.data![0]).toEqual({ slug: "all", label: "All", filter: undefined });

    // Categories are deduplicated
    const labels = result.data!.map((c) => c.label);
    expect(labels).toContain("Clothing");
    expect(labels).toContain("Electronics");
    expect(labels).toContain("Home");
    expect(labels.filter((l) => l === "Clothing")).toHaveLength(1);
  });

  it("generates correct slug and filter from source_category_name", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetchResponse({ content: [{ source_category_name: "Home & Garden" }] }),
    );

    const result = await adapter.getCategories();
    const category = result.data!.find((c) => c.label === "Home & Garden");
    expect(category).toBeDefined();
    expect(category!.slug).toBe("home-&-garden");
    expect(category!.filter).toBe("Home & Garden");
  });

  it("groups uncategorized products under 'Other'", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetchResponse({
        content: [
          { source_category_name: "Clothing" },
          { source_category_name: "" }, // empty = uncategorized
          { source_category_name: undefined }, // missing = uncategorized
        ],
      }),
    );

    const result = await adapter.getCategories();
    const other = result.data!.find((c) => c.slug === "other");
    expect(other).toEqual({ slug: "other", label: "Other", filter: "" });
  });

  it("does not add 'Other' when all products have categories", async () => {
    vi.stubGlobal("fetch", mockFetchResponse({ content: [{ source_category_name: "Clothing" }] }));

    const result = await adapter.getCategories();
    const other = result.data!.find((c) => c.slug === "other");
    expect(other).toBeUndefined();
  });

  it("caps at 6 categories total (All + 5 derived)", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetchResponse({
        content: [
          { source_category_name: "A" },
          { source_category_name: "B" },
          { source_category_name: "C" },
          { source_category_name: "D" },
          { source_category_name: "E" },
          { source_category_name: "F" },
          { source_category_name: "G" },
        ],
      }),
    );

    const result = await adapter.getCategories();
    expect(result.data).toHaveLength(6); // All + 5
  });

  it("uses cache on second call within TTL", async () => {
    const fetchMock = mockFetchResponse({
      content: [{ source_category_name: "Shoes" }],
    });
    vi.stubGlobal("fetch", fetchMock);

    await adapter.getCategories();
    const callCount1 = fetchMock.mock.calls.length;

    await adapter.getCategories();
    // No additional fetch calls — served from cache
    expect(fetchMock.mock.calls.length).toBe(callCount1);
  });

  it("falls back to Demo Mode when search returns empty content", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      const asStr = String(url);
      // Search endpoint — returns empty (triggers Demo Mode fallback)
      if (asStr.includes("/catalog/offers/search")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ content: [] }),
          text: () => Promise.resolve(JSON.stringify({ content: [] })),
        });
      }
      // Merchants list
      if (asStr.includes("/merchants") && !asStr.includes("/catalog/offers/merchants")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ content: [{ id: 99 }] }),
          text: () => Promise.resolve(JSON.stringify({ content: [{ id: 99 }] })),
        });
      }
      // Merchant offers
      if (asStr.includes("/catalog/offers/merchants/")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ content: [{ source_category_name: "Demo Category" }] }),
          text: () =>
            Promise.resolve(
              JSON.stringify({ content: [{ source_category_name: "Demo Category" }] }),
            ),
        });
      }
      // Fallback
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
        text: () => Promise.resolve("{}"),
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await adapter.getCategories();
    expect(result.error).toBeNull();
    expect(result.data!.some((c) => c.label === "Demo Category")).toBe(true);
  });

  it("returns only 'All' when search returns error and no merchants", async () => {
    // Mock fetch returning an HTTP error — fetchWithRetry will retry 3 times
    // with exponential backoff, so we use fake timers to speed this up.
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      const asStr = String(url);
      if (asStr.includes("/catalog/offers/search")) {
        return Promise.resolve({
          ok: false,
          status: 500,
          json: () => Promise.resolve({ message: "Server error" }),
          text: () => Promise.resolve('{"message":"Server error"}'),
        });
      }
      // Merchants list — also fails
      return Promise.resolve({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ message: "Server error" }),
        text: () => Promise.resolve('{"message":"Server error"}'),
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const promise = adapter.getCategories();
    // Advance through fetchWithRetry's exponential backoff retries
    for (let i = 0; i < 10; i++) {
      await vi.advanceTimersByTimeAsync(5000);
    }
    const result = await promise;

    expect(result.error).toBeNull();
    expect(result.data).toEqual([{ slug: "all", label: "All", filter: undefined }]);
    vi.useRealTimers();
  });

  it("trims whitespace from source_category_name", async () => {
    vi.stubGlobal("fetch", mockFetchResponse({ content: [{ source_category_name: "  Shoes  " }] }));

    const result = await adapter.getCategories();
    const shoes = result.data!.find((c) => c.label === "Shoes");
    expect(shoes).toBeDefined();
    expect(shoes!.filter).toBe("Shoes");
  });
});

// ─── Collections Tests ──────────────────────────────────────────────────

describe("VioletAdapter — Collections", () => {
  let collAdapter: VioletAdapter;

  beforeEach(() => {
    collAdapter = new VioletAdapter(createMockTokenManager(), "https://api.violet.io/v1");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("getCollections()", () => {
    it("fetches and transforms a paginated response", async () => {
      const page1 = {
        content: [
          {
            id: 10,
            name: "Summer Collection",
            description: "Hot weather essentials",
            type: "CUSTOM",
            merchant_id: 5,
            external_id: "shopify-10",
            parent_id: null,
            handle: "summer-collection",
            media: { source_url: "https://cdn.example.com/summer.jpg", alt: "Summer" },
            sort_order: 1,
            date_created: "2026-01-01T00:00:00Z",
            date_last_modified: "2026-03-01T00:00:00Z",
          },
        ],
        last: true,
        total_elements: 1,
        number: 0,
        size: 50,
      };
      vi.stubGlobal("fetch", mockFetchResponse(page1));

      const result = await collAdapter.getCollections();
      expect(result.error).toBeNull();
      expect(result.data).toHaveLength(1);
      expect(result.data![0]).toEqual({
        id: "10",
        merchantId: "5",
        name: "Summer Collection",
        handle: "summer-collection",
        description: "Hot weather essentials",
        type: "CUSTOM",
        status: "ACTIVE",
        externalId: "shopify-10",
        imageUrl: "https://cdn.example.com/summer.jpg",
        imageAlt: "Summer",
        sortOrder: 1,
        productCount: 0,
        dateCreated: "2026-01-01T00:00:00Z",
        dateLastModified: "2026-03-01T00:00:00Z",
      });
    });

    it("paginates through all pages", async () => {
      const p1 = {
        content: [{ id: 1, name: "A", merchant_id: 1, type: "CUSTOM" }],
        last: false,
        total_elements: 2,
        number: 0,
        size: 1,
      };
      const p2 = {
        content: [{ id: 2, name: "B", merchant_id: 1, type: "AUTOMATED" }],
        last: true,
        total_elements: 2,
        number: 2,
        size: 1,
      };
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(p1) })
        .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(p2) });
      vi.stubGlobal("fetch", fetchMock);

      const result = await collAdapter.getCollections();
      expect(result.data).toHaveLength(2);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining("?page=1&size=50&exclude_hidden=true"),
        expect.anything(),
      );
      expect(fetchMock).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining("?page=2&size=50&exclude_hidden=true"),
        expect.anything(),
      );
    });

    it("uses media.source_url for imageUrl", async () => {
      const page = {
        content: [
          {
            id: 1,
            name: "Test",
            merchant_id: 1,
            media: { source_url: "https://img.example.com/collection.jpg" },
          },
        ],
        last: true,
        number: 0,
        size: 50,
      };
      vi.stubGlobal("fetch", mockFetchResponse(page));

      const result = await collAdapter.getCollections();
      expect(result.data![0].imageUrl).toBe("https://img.example.com/collection.jpg");
    });

    it("returns null imageUrl when media is absent", async () => {
      const page = {
        content: [{ id: 1, name: "No Image", merchant_id: 1 }],
        last: true,
        number: 0,
        size: 50,
      };
      vi.stubGlobal("fetch", mockFetchResponse(page));

      const result = await collAdapter.getCollections();
      expect(result.data![0].imageUrl).toBeNull();
    });

    it("returns empty array on API error", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          status: 500,
          json: () => Promise.resolve({}),
          text: () => Promise.resolve("Internal Server Error"),
        }),
      );

      const result = await collAdapter.getCollections();
      expect(result.data).toEqual([]);
      expect(result.error).toBeNull();
    });

    it("caches results across calls", async () => {
      const page = {
        content: [{ id: 1, name: "Cached", merchant_id: 1 }],
        last: true,
        number: 0,
        size: 50,
      };
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(page),
      });
      vi.stubGlobal("fetch", fetchMock);

      const r1 = await collAdapter.getCollections();
      const r2 = await collAdapter.getCollections();
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(r1.data).toEqual(r2.data);
    });

    it("uses merchant-specific endpoint when merchantId provided", async () => {
      const page = { content: [], last: true, number: 0, size: 50 };
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(page),
      });
      vi.stubGlobal("fetch", fetchMock);

      await collAdapter.getCollections("123");
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/catalog/collections/merchants/123"),
        expect.anything(),
      );
    });
  });

  describe("getCollectionOffers()", () => {
    it("fetches paginated offers for a collection", async () => {
      const offer = createMockOffer({ id: 42 });
      const page = {
        content: [offer],
        last: true,
        total_elements: 1,
        number: 0,
        size: 24,
      };
      vi.stubGlobal("fetch", mockFetchResponse(page));

      const result = await collAdapter.getCollectionOffers("10", 1, 24);
      expect(result.error).toBeNull();
      expect(result.data!.data).toHaveLength(1);
      expect(result.data!.data[0].id).toBe("42");
      expect(result.data!.page).toBe(1);
      expect(result.data!.hasNext).toBe(false);
    });

    it("passes 1-based page number directly (no offset)", async () => {
      const page = { content: [], last: true, number: 2, size: 12 };
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(page),
      });
      vi.stubGlobal("fetch", fetchMock);

      await collAdapter.getCollectionOffers("5", 3, 12);
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("?page=3&size=12&exclude_hidden=true"),
        expect.anything(),
      );
    });

    it("returns hasNext=true when not last page", async () => {
      const page = {
        content: [createMockOffer()],
        last: false,
        total_elements: 50,
        number: 0,
        size: 24,
      };
      vi.stubGlobal("fetch", mockFetchResponse(page));

      const result = await collAdapter.getCollectionOffers("1");
      expect(result.data!.hasNext).toBe(true);
    });

    // Contextual pricing
    it("appends base_currency when countryCode resolves to non-USD", async () => {
      const page = {
        content: [createMockOffer()],
        last: true,
        number: 0,
        size: 24,
        total_elements: 1,
      };
      const fetchMock = mockFetchResponse(page);
      vi.stubGlobal("fetch", fetchMock);

      await collAdapter.getCollectionOffers("10", 1, 24, "DE");

      const calledUrl = fetchMock.mock.calls[0]![0] as string;
      expect(calledUrl).toContain("base_currency=EUR");
    });
  });

  describe("getCollectionOfferIds()", () => {
    it("fetches only IDs from /offers/ids endpoint", async () => {
      const page = {
        content: [100, 200, 300],
        last: true,
        total_elements: 3,
        number: 0,
        size: 50,
      };
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(page),
      });
      vi.stubGlobal("fetch", fetchMock);

      const result = await collAdapter.getCollectionOfferIds("10");
      expect(result.error).toBeNull();
      expect(result.data!.data).toEqual(["100", "200", "300"]);
      expect(result.data!.total).toBe(3);
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/offers/ids?page=1&size=50&exclude_hidden=true"),
        expect.anything(),
      );
    });

    it("returns error on API failure", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          status: 403,
          json: () => Promise.resolve({}),
          text: () => Promise.resolve("Forbidden"),
        }),
      );

      const result = await collAdapter.getCollectionOfferIds("99");
      expect(result.data).toBeNull();
      expect(result.error).not.toBeNull();
    });
  });
});
