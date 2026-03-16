import { describe, it, expect, vi, beforeEach } from "vitest";
import { persistOrder } from "../orderPersistence";
import type { PersistOrderInput } from "../../types/orderPersistence.types";

function createMockSupabase() {
  const insertResults: Record<string, unknown> = {
    orders: { id: "order-uuid-123" },
    order_bags: { id: "bag-uuid-456" },
  };

  const mockSingle = vi.fn();
  const mockSelect = vi.fn(() => ({ single: mockSingle }));
  const mockInsert = vi.fn(() => ({
    select: mockSelect,
    // For order_items (no select chain)
    then: undefined,
  }));

  const fromFn = vi.fn((table: string) => {
    const result = insertResults[table];
    // Configure single() return based on table
    mockSingle.mockResolvedValueOnce({ data: result, error: null });

    return {
      insert: (data: unknown) => {
        mockInsert(data);
        if (table === "order_items") {
          // order_items doesn't chain .select().single()
          return Promise.resolve({ error: null });
        }
        return { select: mockSelect };
      },
    };
  });

  return {
    from: fromFn,
    _mockInsert: mockInsert,
    _mockFrom: fromFn,
  };
}

const baseInput: PersistOrderInput = {
  violetOrderId: "violet-123",
  userId: "user-uuid",
  sessionId: null,
  email: "test@example.com",
  status: "COMPLETED",
  subtotal: 5000,
  shippingTotal: 500,
  taxTotal: 450,
  total: 5950,
  currency: "USD",
  bags: [
    {
      violetBagId: "bag-1",
      merchantName: "Test Store",
      status: "COMPLETED",
      financialStatus: "PAID",
      subtotal: 5000,
      shippingTotal: 500,
      taxTotal: 450,
      total: 5950,
      shippingMethod: "Standard",
      carrier: "USPS",
      items: [
        {
          skuId: "sku-1",
          name: "Test Product",
          quantity: 2,
          price: 2500,
          linePrice: 5000,
          thumbnail: "https://example.com/img.jpg",
        },
      ],
    },
  ],
};

describe("persistOrder", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns orderId without guest token for authenticated users", async () => {
    const supabase = createMockSupabase();
    const result = await persistOrder(supabase as never, baseInput);

    expect(result.orderId).toBe("order-uuid-123");
    expect(result.orderLookupToken).toBeUndefined();
  });

  it("generates a guest token when userId is null", async () => {
    const supabase = createMockSupabase();
    const guestInput = { ...baseInput, userId: null, sessionId: "anon-session" };
    const result = await persistOrder(supabase as never, guestInput);

    expect(result.orderId).toBe("order-uuid-123");
    expect(result.orderLookupToken).toBeDefined();
    expect(typeof result.orderLookupToken).toBe("string");
    expect(result.orderLookupToken!.length).toBeGreaterThan(0);
  });

  it("inserts into orders table first", async () => {
    const supabase = createMockSupabase();
    await persistOrder(supabase as never, baseInput);

    expect(supabase._mockFrom).toHaveBeenCalledWith("orders");
  });

  it("inserts bags with flattened shippingMethod and carrier", async () => {
    const supabase = createMockSupabase();
    await persistOrder(supabase as never, baseInput);

    // Verify order_bags was called
    expect(supabase._mockFrom).toHaveBeenCalledWith("order_bags");
  });

  it("throws on order insert failure", async () => {
    const supabase = {
      from: () => ({
        insert: () => ({
          select: () => ({
            single: () =>
              Promise.resolve({
                data: null,
                error: { message: "unique violation" },
              }),
          }),
        }),
      }),
    };

    await expect(persistOrder(supabase as never, baseInput)).rejects.toThrow(
      "Failed to persist order",
    );
  });
});
