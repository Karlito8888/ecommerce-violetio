/**
 * Unit tests for guest order server handler functions.
 *
 * ## Strategy
 * We test `lookupOrderByTokenHandler` and `lookupOrdersByEmailHandler` (the
 * extracted pure handler functions) directly, bypassing TanStack Start's RPC layer.
 *
 * Both `getSupabaseServer` and `getSupabaseSessionClient` are mocked to control
 * database and auth state without hitting a real Supabase instance.
 *
 * `hashOrderLookupToken` is also mocked to return a deterministic hash so we can
 * verify the query is called with the correct hash value.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock Supabase clients ────────────────────────────────────────────────────

const mockGetUser = vi.fn();
const mockServerFrom = vi.fn();
const mockSessionFrom = vi.fn();

vi.mock("../supabaseServer", () => ({
  getSupabaseServer: vi.fn(() => ({
    from: mockServerFrom,
  })),
  getSupabaseSessionClient: vi.fn(() => ({
    auth: { getUser: mockGetUser },
    from: mockSessionFrom,
  })),
}));

// ─── Mock hashOrderLookupToken ────────────────────────────────────────────────

vi.mock("@ecommerce/shared/server/utils", () => ({
  hashOrderLookupToken: vi.fn((token: string) => `hashed_${token}`),
}));

// ─── Import handlers after mocks ──────────────────────────────────────────────

import { lookupOrderByTokenHandler, lookupOrdersByEmailHandler } from "../guestOrderHandlers";

// ─── Test helpers ─────────────────────────────────────────────────────────────

const mockOrder = {
  id: "order-abc",
  email: "guest@example.com",
  status: "PROCESSING",
  total: 9900,
  subtotal: 8500,
  shipping_total: 1000,
  tax_total: 400,
  currency: "USD",
  created_at: "2026-03-15T10:00:00Z",
  order_lookup_token_hash: "hashed_my-secret-token",
  order_bags: [
    {
      id: "bag-1",
      merchant_name: "Test Merchant",
      status: "PROCESSING",
      total: 9900,
      order_items: [{ id: "item-1", name: "Product A", quantity: 1, line_price: 9900 }],
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── lookupOrderByTokenHandler ────────────────────────────────────────────────

describe("lookupOrderByTokenHandler — token found", () => {
  it("returns the order when a valid token is provided", async () => {
    const mockQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: mockOrder, error: null }),
    };
    mockServerFrom.mockReturnValue(mockQuery);

    const result = await lookupOrderByTokenHandler("my-secret-token");

    expect(result).toEqual(mockOrder);
  });

  it("queries by the SHA-256 hash of the provided token (not plaintext)", async () => {
    const mockQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: mockOrder, error: null }),
    };
    mockServerFrom.mockReturnValue(mockQuery);

    await lookupOrderByTokenHandler("my-secret-token");

    expect(mockQuery.eq).toHaveBeenCalledWith("order_lookup_token_hash", "hashed_my-secret-token");
  });

  it("queries orders table with full bags and items select", async () => {
    const mockQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: mockOrder, error: null }),
    };
    mockServerFrom.mockReturnValue(mockQuery);

    await lookupOrderByTokenHandler("my-secret-token");

    expect(mockServerFrom).toHaveBeenCalledWith("orders");
    expect(mockQuery.select).toHaveBeenCalledWith(
      "*, order_bags(*, order_items(*), order_refunds(*))",
    );
  });
});

describe("lookupOrderByTokenHandler — token not found", () => {
  it("returns null for PGRST116 error (token not in DB)", async () => {
    const mockQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi
        .fn()
        .mockResolvedValue({ data: null, error: { code: "PGRST116", message: "No rows found" } }),
    };
    mockServerFrom.mockReturnValue(mockQuery);

    const result = await lookupOrderByTokenHandler("invalid-token");

    expect(result).toBeNull();
  });

  it("throws for non-PGRST116 Supabase errors", async () => {
    const mockQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: null,
        error: { code: "500", message: "Internal server error" },
      }),
    };
    mockServerFrom.mockReturnValue(mockQuery);

    await expect(lookupOrderByTokenHandler("some-token")).rejects.toThrow("Internal server error");
  });
});

// ─── lookupOrdersByEmailHandler ───────────────────────────────────────────────

describe("lookupOrdersByEmailHandler — authenticated session", () => {
  it("returns orders for the verified session email", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-123", email: "guest@example.com" } },
      error: null,
    });
    const mockQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [mockOrder], error: null }),
    };
    mockServerFrom.mockReturnValue(mockQuery);

    const result = await lookupOrdersByEmailHandler();

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(mockOrder);
  });

  it("queries by the session user's email (not user_id)", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-123", email: "guest@example.com" } },
      error: null,
    });
    const mockQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    mockServerFrom.mockReturnValue(mockQuery);

    await lookupOrdersByEmailHandler();

    expect(mockQuery.eq).toHaveBeenCalledWith("email", "guest@example.com");
    expect(mockQuery.eq).not.toHaveBeenCalledWith("user_id", expect.anything());
  });

  it("returns orders in descending created_at order", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-123", email: "guest@example.com" } },
      error: null,
    });
    const mockQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    mockServerFrom.mockReturnValue(mockQuery);

    await lookupOrdersByEmailHandler();

    expect(mockQuery.order).toHaveBeenCalledWith("created_at", { ascending: false });
  });

  it("returns empty array when no orders exist for this email", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-123", email: "noorders@example.com" } },
      error: null,
    });
    const mockQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    mockServerFrom.mockReturnValue(mockQuery);

    const result = await lookupOrdersByEmailHandler();

    expect(result).toEqual([]);
  });
});

describe("lookupOrdersByEmailHandler — no session", () => {
  it("throws 'Not authenticated' when no user session exists", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: null,
    });

    await expect(lookupOrdersByEmailHandler()).rejects.toThrow("Not authenticated");
  });

  it("throws 'Not authenticated' when session exists but has no email", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-123", email: null } },
      error: null,
    });

    await expect(lookupOrdersByEmailHandler()).rejects.toThrow("Not authenticated");
  });
});

describe("lookupOrdersByEmailHandler — database error", () => {
  it("throws when Supabase returns a query error", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-123", email: "guest@example.com" } },
      error: null,
    });
    const mockQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: null, error: { message: "DB connection failed" } }),
    };
    mockServerFrom.mockReturnValue(mockQuery);

    await expect(lookupOrdersByEmailHandler()).rejects.toThrow("DB connection failed");
  });
});
