/**
 * Tests for searchDistributions — cross-order distribution search.
 *
 * @see https://docs.violet.io/api-reference/payments/distributions/search-distributions
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { searchDistributions } from "../violetOrders.js";
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

const MOCK_PAGINATED = {
  content: [
    {
      id: 1,
      bag_id: 10,
      type: "PAYMENT",
      status: "SENT",
      channel_amount: 500,
      stripe_fee: 88,
      merchant_amount: 4412,
      subtotal: 5000,
    },
    {
      id: 2,
      bag_id: 11,
      type: "REFUND",
      status: "PENDING",
      channel_amount: -100,
      stripe_fee: 0,
      merchant_amount: -1000,
      subtotal: -1000,
    },
  ],
  totalElements: 15,
  totalPages: 2,
  number: 0,
  size: 20,
  first: true,
  last: false,
  empty: false,
};

// ─── Tests ──────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

describe("searchDistributions", () => {
  it("searches with no filters (broad search)", async () => {
    mockFetch.mockResolvedValueOnce({ data: MOCK_PAGINATED, error: null });

    const result = await searchDistributions(makeCtx(), "1");

    expect(result.error).toBeNull();
    expect(result.data!.distributions).toHaveLength(2);
    expect(result.data!.total).toBe(15);
    expect(result.data!.page).toBe(0);
    expect(result.data!.pageSize).toBe(20);
    expect(result.data!.hasNext).toBe(true);

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("/payments/DEVELOPER/1/distributions/search");
    expect(url).toContain("include_merchants=true");
    expect(url).toContain("include_channels=true");

    const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string);
    expect(Object.keys(body)).toHaveLength(0);
  });

  it("passes search filters in the body", async () => {
    mockFetch.mockResolvedValueOnce({
      data: { ...MOCK_PAGINATED, content: [], totalElements: 0, last: true },
      error: null,
    });

    const result = await searchDistributions(
      makeCtx(),
      "1",
      {
        orderId: "123",
        merchantId: "456",
        beforeDate: "2026-04-16T00:00:00Z",
        afterDate: "2026-04-01T00:00:00Z",
      },
      2,
      10,
    );

    expect(result.data!.distributions).toHaveLength(0);

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("page=2");
    expect(url).toContain("size=10");

    const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string);
    expect(body.order_id).toBe(123);
    expect(body.merchant_id).toBe(456);
    expect(body.before_date).toBe("2026-04-16T00:00:00Z");
    expect(body.after_date).toBe("2026-04-01T00:00:00Z");
  });

  it("passes all available filters", async () => {
    mockFetch.mockResolvedValueOnce({
      data: { ...MOCK_PAGINATED, content: [], totalElements: 0, last: true },
      error: null,
    });

    await searchDistributions(makeCtx(), "1", {
      orderId: "1",
      merchantId: "2",
      bagId: "3",
      externalOrderId: "ext-123",
      payoutId: "4",
      payoutTransferId: "5",
      beforeDate: "2026-12-31T23:59:59Z",
      afterDate: "2026-01-01T00:00:00Z",
    });

    const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string);
    expect(body.order_id).toBe(1);
    expect(body.merchant_id).toBe(2);
    expect(body.bag_id).toBe(3);
    expect(body.external_order_id).toBe("ext-123");
    expect(body.payout_id).toBe(4);
    expect(body.payout_transfer_id).toBe(5);
    expect(body.before_date).toBe("2026-12-31T23:59:59Z");
    expect(body.after_date).toBe("2026-01-01T00:00:00Z");
  });

  it("returns error when API fails", async () => {
    mockFetch.mockResolvedValueOnce({
      data: null,
      error: { code: "VIOLET.API_ERROR", message: "Server error" },
    });

    const result = await searchDistributions(makeCtx(), "1");
    expect(result.data).toBeNull();
    expect(result.error!.code).toBe("VIOLET.API_ERROR");
  });

  it("handles single-page result (last=true)", async () => {
    mockFetch.mockResolvedValueOnce({
      data: { ...MOCK_PAGINATED, last: true, totalElements: 2 },
      error: null,
    });

    const result = await searchDistributions(makeCtx(), "1");
    expect(result.data!.hasNext).toBe(false);
    expect(result.data!.total).toBe(2);
  });

  it("defaults page and pageSize when not provided", async () => {
    mockFetch.mockResolvedValueOnce({ data: MOCK_PAGINATED, error: null });

    await searchDistributions(makeCtx(), "1");

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("page=1");
    expect(url).toContain("size=20");
  });
});
