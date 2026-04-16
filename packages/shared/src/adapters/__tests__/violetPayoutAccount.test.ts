/**
 * Tests for violetPayoutAccounts — PPA API endpoints.
 *
 * @see https://docs.violet.io/api-reference/payments/payout-accounts
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getActivePayoutAccount,
  getAllPayoutAccounts,
  getPayoutAccountById,
  violetPayoutAccountSchema,
} from "../violetPayoutAccounts.js";
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

const MOCK_PPA = {
  id: 123,
  account_type: "MERCHANT",
  account_id: 456,
  merchant_id: 456,
  app_id: 1,
  is_active: true,
  country_code: "US",
  payment_provider: "STRIPE",
  payment_provider_account_id: "acct_1R42bBHasdfghjk2",
  payment_provider_account_type: "EXPRESS",
  payment_provider_account: {
    account_id: "acct_1R42bBHasdfghjk2",
    account_type: "EXPRESS",
    banking_country: "US",
    banking_currency: "usd",
    charges_enabled: true,
    payouts_enabled: true,
    requirements: {
      alternatives: [],
      currently_due: [],
      errors: [],
      eventually_due: [],
      past_due: [],
      pending_verification: [],
    },
  },
  errors: [],
  date_created: "2026-04-01T00:00:00Z",
  date_last_modified: "2026-04-16T00:00:00Z",
};

// ─── Tests ──────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

describe("violetPayoutAccountSchema", () => {
  it("validates a complete PPA response", () => {
    const result = violetPayoutAccountSchema.safeParse(MOCK_PPA);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe(123);
      expect(result.data.payment_provider).toBe("STRIPE");
      expect(result.data.payment_provider_account?.charges_enabled).toBe(true);
    }
  });

  it("validates a minimal PPA response", () => {
    const result = violetPayoutAccountSchema.safeParse({
      id: 1,
      is_active: false,
      payment_provider: "EXTERNAL",
    });
    expect(result.success).toBe(true);
  });

  it("rejects response with invalid payment_provider", () => {
    const result = violetPayoutAccountSchema.safeParse({
      ...MOCK_PPA,
      payment_provider: "INVALID",
    });
    expect(result.success).toBe(false);
  });

  it("validates EXTERNAL provider with no account details", () => {
    const result = violetPayoutAccountSchema.safeParse({
      id: 99,
      is_active: false,
      payment_provider: "EXTERNAL",
      country_code: "CN",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.payment_provider).toBe("EXTERNAL");
    }
  });

  it("validates PPA errors array", () => {
    const result = violetPayoutAccountSchema.safeParse({
      ...MOCK_PPA,
      errors: [
        {
          id: 1,
          payout_account_id: 123,
          error_code: 4001,
          error_message: "KYC verification required",
          resolved: false,
          date_created: "2026-04-15T00:00:00Z",
        },
      ],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.errors).toHaveLength(1);
      expect(result.data.errors?.[0]?.error_message).toBe("KYC verification required");
    }
  });
});

describe("getActivePayoutAccount", () => {
  it("fetches active PPA with extended details", async () => {
    mockFetch.mockResolvedValueOnce({ data: MOCK_PPA, error: null });

    const result = await getActivePayoutAccount(makeCtx(), "456");

    expect(result).not.toBeNull();
    expect(result!.id).toBe(123);
    expect(result!.is_active).toBe(true);
    expect(result!.payment_provider_account?.charges_enabled).toBe(true);

    expect(mockFetch).toHaveBeenCalledOnce();
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("/payments/MERCHANT/456/payout_account");
    expect(url).toContain("extended=true");
  });

  it("passes app_id when provided", async () => {
    mockFetch.mockResolvedValueOnce({ data: MOCK_PPA, error: null });

    await getActivePayoutAccount(makeCtx(), "456", "1");

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("app_id=1");
  });

  it("returns null on 404 (no active PPA)", async () => {
    mockFetch.mockResolvedValueOnce({
      data: null,
      error: { code: "VIOLET.NOT_FOUND", message: "Not found" },
    });

    const result = await getActivePayoutAccount(makeCtx(), "999");
    expect(result).toBeNull();
  });

  it("returns null on API error", async () => {
    mockFetch.mockResolvedValueOnce({
      data: null,
      error: { code: "VIOLET.API_ERROR", message: "Server error" },
    });

    const result = await getActivePayoutAccount(makeCtx(), "456");
    expect(result).toBeNull();
  });

  it("returns null on Zod validation failure", async () => {
    mockFetch.mockResolvedValueOnce({ data: { invalid: true }, error: null });

    const result = await getActivePayoutAccount(makeCtx(), "456");
    expect(result).toBeNull();
  });
});

describe("getAllPayoutAccounts", () => {
  it("fetches all PPAs for a merchant", async () => {
    const activePPA = { ...MOCK_PPA, id: 1, is_active: true };
    const inactivePPA = {
      ...MOCK_PPA,
      id: 2,
      is_active: false,
      date_deactivated: "2026-03-01T00:00:00Z",
    };

    mockFetch.mockResolvedValueOnce({ data: [activePPA, inactivePPA], error: null });

    const result = await getAllPayoutAccounts(makeCtx(), "456");

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe(1);
    expect(result[1].id).toBe(2);

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("/payments/MERCHANT/456/payout_accounts");
    expect(url).toContain("extended=true");
  });

  it("returns empty array on API error", async () => {
    mockFetch.mockResolvedValueOnce({
      data: null,
      error: { code: "VIOLET.API_ERROR", message: "Error" },
    });

    const result = await getAllPayoutAccounts(makeCtx(), "456");
    expect(result).toEqual([]);
  });

  it("returns empty array when response is not an array", async () => {
    mockFetch.mockResolvedValueOnce({ data: { not: "array" }, error: null });

    const result = await getAllPayoutAccounts(makeCtx(), "456");
    expect(result).toEqual([]);
  });

  it("skips items that fail Zod validation", async () => {
    const validPPA = { ...MOCK_PPA, id: 1 };
    const invalidPPA = { invalid: true };

    mockFetch.mockResolvedValueOnce({ data: [validPPA, invalidPPA], error: null });

    const result = await getAllPayoutAccounts(makeCtx(), "456");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(1);
  });
});

describe("getPayoutAccountById", () => {
  it("fetches PPA by Violet ID with extended details", async () => {
    mockFetch.mockResolvedValueOnce({ data: MOCK_PPA, error: null });

    const result = await getPayoutAccountById(makeCtx(), "123");

    expect(result).not.toBeNull();
    expect(result!.id).toBe(123);

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("/payments/payout_accounts/123");
    expect(url).toContain("extended=true");
  });

  it("returns null on 404", async () => {
    mockFetch.mockResolvedValueOnce({
      data: null,
      error: { code: "VIOLET.NOT_FOUND", message: "Not found" },
    });

    const result = await getPayoutAccountById(makeCtx(), "999");
    expect(result).toBeNull();
  });

  it("returns null on API error", async () => {
    mockFetch.mockResolvedValueOnce({
      data: null,
      error: { code: "VIOLET.API_ERROR", message: "Error" },
    });

    const result = await getPayoutAccountById(makeCtx(), "123");
    expect(result).toBeNull();
  });
});
