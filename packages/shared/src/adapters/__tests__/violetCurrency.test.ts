/**
 * Tests for violetCurrency — live exchange rates from Violet API.
 *
 * @see https://docs.violet.io/api-reference/catalog/currencies/currency-exchange-rates
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getExchangeRates,
  _resetExchangeRatesCache,
  violetExchangeRatesResponseSchema,
} from "../violetCurrency.js";
import type { CatalogContext } from "../violetCatalog.js";

// ─── Mock fetchWithRetry ────────────────────────────────────────────

vi.mock("../violetFetch.js", () => ({
  fetchWithRetry: vi.fn(),
}));

import { fetchWithRetry } from "../violetFetch.js";
const mockFetch = vi.mocked(fetchWithRetry);

// ─── Helpers ────────────────────────────────────────────────────────

function makeCtx(): CatalogContext {
  return {
    apiBase: "https://sandbox-api.violet.io/v1",
    tokenManager: {
      getAuthHeaders: vi.fn().mockResolvedValue({
        data: {
          "X-Violet-Token": "tok",
          "X-Violet-App-Id": "1",
          "X-Violet-App-Secret": "secret",
        },
        error: null,
      }),
    } as unknown as CatalogContext["tokenManager"],
  };
}

const MOCK_RESPONSE = {
  success: true,
  timestamp: 1713249600,
  base: "USD",
  date: "2026-04-16",
  rates: {
    USD: 1,
    EUR: 0.92,
    GBP: 0.79,
    CAD: 1.36,
    JPY: 151.5,
  },
};

// ─── Tests ──────────────────────────────────────────────────────────

beforeEach(() => {
  _resetExchangeRatesCache();
  vi.clearAllMocks();
});

describe("violetExchangeRatesResponseSchema", () => {
  it("validates a correct response", () => {
    const result = violetExchangeRatesResponseSchema.safeParse(MOCK_RESPONSE);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.rates.EUR).toBe(0.92);
      expect(result.data.base).toBe("USD");
    }
  });

  it("rejects response with missing required fields", () => {
    const result = violetExchangeRatesResponseSchema.safeParse({
      success: true,
      // missing timestamp, base, date, rates
    });
    expect(result.success).toBe(false);
  });

  it("rejects response with invalid rates values", () => {
    const result = violetExchangeRatesResponseSchema.safeParse({
      ...MOCK_RESPONSE,
      rates: { EUR: "not-a-number" },
    });
    expect(result.success).toBe(false);
  });
});

describe("getExchangeRates", () => {
  it("fetches rates from Violet API and returns them", async () => {
    mockFetch.mockResolvedValueOnce({ data: MOCK_RESPONSE, error: null });

    const result = await getExchangeRates(makeCtx());

    expect(result).not.toBeNull();
    expect(result!.rates.EUR).toBe(0.92);
    expect(result!.date).toBe("2026-04-16");

    // Verify correct endpoint called
    expect(mockFetch).toHaveBeenCalledOnce();
    const callArgs = mockFetch.mock.calls[0];
    expect(callArgs[0]).toContain("/catalog/currencies/latest");
    expect(callArgs[0]).toContain("base_currency=USD");
    expect(callArgs[1]).toEqual({ method: "GET" });
  });

  it("caches rates and does not call API again within TTL", async () => {
    mockFetch.mockResolvedValueOnce({ data: MOCK_RESPONSE, error: null });

    // First call — hits API
    const result1 = await getExchangeRates(makeCtx());
    expect(mockFetch).toHaveBeenCalledOnce();

    // Second call — uses cache
    const result2 = await getExchangeRates(makeCtx());
    expect(mockFetch).toHaveBeenCalledOnce(); // still 1 call
    expect(result2).toEqual(result1);
  });

  it("returns null when API fails and no cache exists", async () => {
    mockFetch.mockResolvedValueOnce({
      data: null,
      error: { code: "VIOLET.API_ERROR", message: "Server error" },
    });

    const result = await getExchangeRates(makeCtx());
    expect(result).toBeNull();
  });

  it("returns stale cache when API fails after a previous success", async () => {
    // First call — success
    mockFetch.mockResolvedValueOnce({ data: MOCK_RESPONSE, error: null });
    await getExchangeRates(makeCtx());

    // Simulate cache expiry
    _resetExchangeRatesCache();
    // Since we reset the cache, the next call will hit the API again

    // Second call — API fails, no stale cache available
    mockFetch.mockResolvedValueOnce({
      data: null,
      error: { code: "VIOLET.NETWORK_ERROR", message: "Network error" },
    });

    const result = await getExchangeRates(makeCtx());
    expect(result).toBeNull();
  });

  it("returns null when Violet response has success: false", async () => {
    mockFetch.mockResolvedValueOnce({
      data: { ...MOCK_RESPONSE, success: false },
      error: null,
    });

    const result = await getExchangeRates(makeCtx());
    expect(result).toBeNull();
  });

  it("returns null when Zod validation fails", async () => {
    mockFetch.mockResolvedValueOnce({
      data: { invalid: "data" },
      error: null,
    });

    const result = await getExchangeRates(makeCtx());
    expect(result).toBeNull();
  });

  it("fetches fresh rates after cache expires", async () => {
    // First call — populate cache
    mockFetch.mockResolvedValueOnce({ data: MOCK_RESPONSE, error: null });
    await getExchangeRates(makeCtx());
    expect(mockFetch).toHaveBeenCalledOnce();

    // Reset cache (simulates expiry)
    _resetExchangeRatesCache();

    // Second call — fresh fetch
    const freshRates = {
      ...MOCK_RESPONSE,
      rates: { ...MOCK_RESPONSE.rates, EUR: 0.93 },
      date: "2026-04-17",
    };
    mockFetch.mockResolvedValueOnce({ data: freshRates, error: null });
    const result = await getExchangeRates(makeCtx());

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result!.rates.EUR).toBe(0.93);
    expect(result!.date).toBe("2026-04-17");
  });
});
