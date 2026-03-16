/**
 * Unit tests for orders server handler functions.
 *
 * ## Strategy
 * We test `ordersHandler` and `orderDetailHandler` (the extracted pure functions)
 * directly, bypassing TanStack Start's RPC layer. This avoids the HTTP fetch
 * that `getOrdersFn()` would make in a test environment.
 *
 * `getSupabaseSessionClient` is mocked to control the auth state.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock Supabase Session Client ────────────────────────────────────────────

const mockGetUser = vi.fn();
const mockFrom = vi.fn();

vi.mock("../supabaseServer", () => ({
  getSupabaseServer: vi.fn(),
  getSupabaseSessionClient: vi.fn(() => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  })),
}));

// ─── Import handlers after mocks ──────────────────────────────────────────────

import { ordersHandler, orderDetailHandler } from "../orderHandlers";

// ─── Test helpers ─────────────────────────────────────────────────────────────

function mockUnauthenticated() {
  mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
}

function mockAnonymousUser() {
  mockGetUser.mockResolvedValue({
    data: { user: { id: "anon-id", is_anonymous: true } },
    error: null,
  });
}

function mockAuthenticatedUser(userId = "user-123") {
  mockGetUser.mockResolvedValue({
    data: { user: { id: userId, is_anonymous: false } },
    error: null,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── ordersHandler ────────────────────────────────────────────────────────────

describe("ordersHandler — authentication checks", () => {
  it("throws 'Not authenticated' when no user session exists", async () => {
    mockUnauthenticated();
    await expect(ordersHandler()).rejects.toThrow("Not authenticated");
  });

  it("throws 'Not authenticated' for anonymous users", async () => {
    mockAnonymousUser();
    await expect(ordersHandler()).rejects.toThrow("Not authenticated");
  });
});

describe("ordersHandler — authenticated user", () => {
  it("returns empty array when user has no orders", async () => {
    mockAuthenticatedUser();
    const mockQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    mockFrom.mockReturnValue(mockQuery);

    const result = await ordersHandler();

    expect(result).toEqual([]);
  });

  it("transforms order_bags aggregate into bag_count field", async () => {
    mockAuthenticatedUser();
    const mockRawOrders = [
      {
        id: "order-1",
        user_id: "user-123",
        status: "COMPLETED",
        total: 5000,
        currency: "USD",
        created_at: "2026-03-10T10:00:00Z",
        order_bags: [{ count: 3 }],
      },
    ];
    const mockQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: mockRawOrders, error: null }),
    };
    mockFrom.mockReturnValue(mockQuery);

    const result = await ordersHandler();

    expect(result).toHaveLength(1);
    expect(result[0].bag_count).toBe(3);
    // order_bags aggregate should not appear in the result
    expect("order_bags" in result[0]).toBe(false);
  });

  it("defaults bag_count to 0 when order_bags aggregate is empty", async () => {
    mockAuthenticatedUser();
    const mockRawOrders = [
      {
        id: "order-2",
        user_id: "user-123",
        status: "IN_PROGRESS",
        total: 2000,
        currency: "USD",
        created_at: "2026-03-11T10:00:00Z",
        order_bags: [],
      },
    ];
    const mockQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: mockRawOrders, error: null }),
    };
    mockFrom.mockReturnValue(mockQuery);

    const result = await ordersHandler();

    expect(result[0].bag_count).toBe(0);
  });

  it("queries orders filtered by the authenticated user's ID", async () => {
    mockAuthenticatedUser("specific-user-id");
    const mockQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    mockFrom.mockReturnValue(mockQuery);

    await ordersHandler();

    expect(mockQuery.eq).toHaveBeenCalledWith("user_id", "specific-user-id");
    expect(mockQuery.order).toHaveBeenCalledWith("created_at", { ascending: false });
  });

  it("throws when Supabase returns a query error", async () => {
    mockAuthenticatedUser();
    const mockQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: null, error: { message: "Connection failed" } }),
    };
    mockFrom.mockReturnValue(mockQuery);

    await expect(ordersHandler()).rejects.toThrow("Connection failed");
  });
});

// ─── orderDetailHandler ───────────────────────────────────────────────────────

describe("orderDetailHandler — authentication checks", () => {
  it("throws 'Not authenticated' when no user session exists", async () => {
    mockUnauthenticated();
    await expect(orderDetailHandler("order-1")).rejects.toThrow("Not authenticated");
  });

  it("throws 'Not authenticated' for anonymous users", async () => {
    mockAnonymousUser();
    await expect(orderDetailHandler("order-1")).rejects.toThrow("Not authenticated");
  });
});

describe("orderDetailHandler — authenticated user", () => {
  it("returns null when order is not found (PGRST116 — RLS blocked or missing)", async () => {
    mockAuthenticatedUser();
    const mockQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi
        .fn()
        .mockResolvedValue({ data: null, error: { code: "PGRST116", message: "No rows" } }),
    };
    mockFrom.mockReturnValue(mockQuery);

    const result = await orderDetailHandler("nonexistent-id");

    expect(result).toBeNull();
  });

  it("returns the full order with bags and items when found", async () => {
    mockAuthenticatedUser();
    const mockOrder = {
      id: "order-1",
      status: "SHIPPED",
      total: 8500,
      currency: "USD",
      order_bags: [
        {
          id: "bag-1",
          merchant_name: "Test Merchant",
          status: "SHIPPED",
          order_items: [{ id: "item-1", name: "Test Product", quantity: 1, price: 8500 }],
        },
      ],
    };
    const mockQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: mockOrder, error: null }),
    };
    mockFrom.mockReturnValue(mockQuery);

    const result = await orderDetailHandler("order-1");

    expect(result).toEqual(mockOrder);
    expect(result?.order_bags).toHaveLength(1);
    expect(result?.order_bags[0].order_items).toHaveLength(1);
  });

  it("queries by the provided orderId", async () => {
    mockAuthenticatedUser();
    const mockQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: "order-abc" }, error: null }),
    };
    mockFrom.mockReturnValue(mockQuery);

    await orderDetailHandler("order-abc");

    expect(mockQuery.eq).toHaveBeenCalledWith("id", "order-abc");
  });

  it("throws for non-PGRST116 Supabase errors", async () => {
    mockAuthenticatedUser();
    const mockQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi
        .fn()
        .mockResolvedValue({ data: null, error: { code: "500", message: "Server error" } }),
    };
    mockFrom.mockReturnValue(mockQuery);

    await expect(orderDetailHandler("order-1")).rejects.toThrow("Server error");
  });
});
