import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { VioletAdapter } from "../violetAdapter.js";
import type { VioletTokenManager } from "../../clients/violetAuth.js";
import { parseAndTransformCart } from "../violetCartTransforms.js";

// ─── Fixtures ────────────────────────────────────────────────────────────────

function createMockTokenManager(): VioletTokenManager {
  return {
    getAuthHeaders: vi.fn().mockResolvedValue({
      data: {
        "X-Violet-Token": "test-token",
        "X-Violet-App-Id": "12345",
        "X-Violet-App-Secret": "test-secret",
      },
      error: null,
    }),
    getValidToken: vi.fn(),
    config: {},
  } as unknown as VioletTokenManager;
}

/**
 * Builds a raw Violet cart response with optional discount data.
 * Mirrors the JSON shape returned by Violet's API.
 */
function makeVioletCartResponse(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 999,
    channel_id: 12345,
    currency: "USD",
    bags: [
      {
        id: 100,
        merchant_id: 50,
        merchant_name: "Test Merchant",
        skus: [{ id: 200, sku_id: 300, quantity: 2, price: 2500 }],
        subtotal: 5000,
        tax: 400,
        shipping_total: 599,
        discount_total: 0,
        errors: [],
        discounts: [],
      },
    ],
    errors: [],
    ...overrides,
  };
}

/**
 * Cart with an APPLIED discount — simulates the post-pricing response.
 * Subtotal: 5000, Discount: 1000 (20%), Tax: 320, Shipping: 599, Total: 4919
 */
function makeCartWithAppliedDiscount(): Record<string, unknown> {
  return makeVioletCartResponse({
    bags: [
      {
        id: 100,
        merchant_id: 50,
        merchant_name: "Test Merchant",
        skus: [{ id: 200, sku_id: 300, quantity: 2, price: 2500 }],
        subtotal: 5000,
        tax: 320,
        shipping_total: 599,
        discount_total: 1000,
        errors: [],
        discounts: [
          {
            id: 5001,
            bag_id: 100,
            status: "APPLIED",
            type: "CODE",
            code: "20POFF",
            value_type: "PERCENTAGE",
            amount_total: 1000,
            date_created: "2026-04-14T12:00:00Z",
            date_last_modified: "2026-04-14T12:01:00Z",
          },
        ],
      },
    ],
  });
}

/**
 * Multi-bag cart with discounts on both bags.
 * Bag 1: subtotal 5000, discount 500 | Bag 2: subtotal 3000, discount 300
 */
function makeMultiBagCartWithDiscounts(): Record<string, unknown> {
  return makeVioletCartResponse({
    bags: [
      {
        id: 100,
        merchant_id: 50,
        merchant_name: "Merchant A",
        skus: [{ id: 200, sku_id: 300, quantity: 2, price: 2500 }],
        subtotal: 5000,
        tax: 360,
        shipping_total: 599,
        discount_total: 500,
        errors: [],
        discounts: [
          {
            id: 5001,
            bag_id: 100,
            status: "APPLIED",
            type: "CODE",
            code: "SAVE10",
            value_type: "PERCENTAGE",
            amount_total: 500,
            date_created: "2026-04-14T12:00:00Z",
          },
        ],
      },
      {
        id: 101,
        merchant_id: 51,
        merchant_name: "Merchant B",
        skus: [{ id: 201, sku_id: 301, quantity: 1, price: 3000 }],
        subtotal: 3000,
        tax: 180,
        shipping_total: 399,
        discount_total: 300,
        errors: [],
        discounts: [
          {
            id: 5002,
            bag_id: 101,
            status: "APPLIED",
            type: "CODE",
            code: "SAVE10B",
            value_type: "AMOUNT",
            amount_total: 300,
            date_created: "2026-04-14T12:00:00Z",
          },
        ],
      },
    ],
  });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("VioletAdapter — discount methods", () => {
  let adapter: VioletAdapter;
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.stubEnv("VIOLET_APP_ID", "12345");
    adapter = new VioletAdapter(createMockTokenManager(), "https://test-api.violet.io/v1");
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  // ── addDiscount ──────────────────────────────────────────────────

  describe("addDiscount", () => {
    it("calls POST /checkout/cart/{id}/discounts with code and merchant_id", async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify(makeCartWithAppliedDiscount()), { status: 200 }),
      );

      await adapter.addDiscount("999", { code: "20POFF", merchantId: "50" });

      expect(fetchSpy).toHaveBeenCalledWith(
        "https://test-api.violet.io/v1/checkout/cart/999/discounts",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ code: "20POFF", merchant_id: 50 }),
        }),
      );
    });

    it("includes email in body when provided (customer-restricted discounts)", async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify(makeCartWithAppliedDiscount()), { status: 200 }),
      );

      await adapter.addDiscount("999", {
        code: "ONCE_PER_CUSTOMER",
        merchantId: "50",
        email: "shopper@example.com",
      });

      const callArgs = fetchSpy.mock.calls[0]!;
      const body = JSON.parse((callArgs[1] as RequestInit).body as string);
      expect(body.code).toBe("ONCE_PER_CUSTOMER");
      expect(body.merchant_id).toBe(50);
      expect(body.email).toBe("shopper@example.com");
    });

    it("omits email when not provided", async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify(makeCartWithAppliedDiscount()), { status: 200 }),
      );

      await adapter.addDiscount("999", { code: "20POFF", merchantId: "50" });

      const callArgs = fetchSpy.mock.calls[0]!;
      const body = JSON.parse((callArgs[1] as RequestInit).body as string);
      expect(body).not.toHaveProperty("email");
    });

    it("returns transformed cart with discounts mapped correctly", async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify(makeCartWithAppliedDiscount()), { status: 200 }),
      );

      const result = await adapter.addDiscount("999", { code: "20POFF", merchantId: "50" });

      expect(result.error).toBeNull();
      expect(result.data).toBeDefined();
      const bag = result.data!.bags[0];

      // Discount total deducted from total
      expect(bag.discountTotal).toBe(1000);
      expect(bag.discounts).toHaveLength(1);

      const discount = bag.discounts[0];
      expect(discount.id).toBe("5001");
      expect(discount.bagId).toBe("100");
      expect(discount.status).toBe("APPLIED");
      expect(discount.type).toBe("CODE");
      expect(discount.code).toBe("20POFF");
      expect(discount.valueType).toBe("PERCENTAGE");
      expect(discount.amountTotal).toBe(1000);
      expect(discount.dateCreated).toBe("2026-04-14T12:00:00Z");
    });

    it("returns error when Violet API fails (invalid code)", async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ message: "Invalid discount code" }), { status: 400 }),
      );

      const result = await adapter.addDiscount("999", { code: "BADCODE", merchantId: "50" });

      expect(result.data).toBeNull();
      expect(result.error).toBeDefined();
    });

    it("returns error when cart not found", async () => {
      fetchSpy.mockResolvedValueOnce(new Response("Not Found", { status: 404 }));

      const result = await adapter.addDiscount("999", { code: "20POFF", merchantId: "50" });

      expect(result.data).toBeNull();
      expect(result.error?.code).toBe("VIOLET.NOT_FOUND");
    });
  });

  // ── removeDiscount ───────────────────────────────────────────────

  describe("removeDiscount", () => {
    it("calls DELETE /checkout/cart/{id}/discounts/{discountId}", async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify(makeVioletCartResponse()), { status: 200 }),
      );

      await adapter.removeDiscount("999", "5001");

      expect(fetchSpy).toHaveBeenCalledWith(
        "https://test-api.violet.io/v1/checkout/cart/999/discounts/5001",
        expect.objectContaining({ method: "DELETE" }),
      );
    });

    it("returns cart without the removed discount", async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify(makeVioletCartResponse()), { status: 200 }),
      );

      const result = await adapter.removeDiscount("999", "5001");

      expect(result.error).toBeNull();
      expect(result.data).toBeDefined();
      expect(result.data!.bags[0].discounts).toHaveLength(0);
      expect(result.data!.bags[0].discountTotal).toBe(0);
    });

    it("returns error when discount not found", async () => {
      fetchSpy.mockResolvedValueOnce(new Response("Not Found", { status: 404 }));

      const result = await adapter.removeDiscount("999", "9999");

      expect(result.data).toBeNull();
      expect(result.error).toBeDefined();
    });
  });
});

// ─── Transform tests (parseAndTransformCart) ─────────────────────────────────

describe("parseAndTransformCart — discount handling", () => {
  it("maps discount_total from Violet bag to Bag.discountTotal", () => {
    const raw = makeCartWithAppliedDiscount();
    const result = parseAndTransformCart(raw);

    expect(result.data).toBeDefined();
    expect(result.data!.bags[0].discountTotal).toBe(1000);
  });

  it("defaults discountTotal to 0 when Violet omits it", () => {
    const raw = makeVioletCartResponse();
    // Ensure discount_total is absent
    delete (raw.bags as Array<Record<string, unknown>>)[0].discount_total;
    const result = parseAndTransformCart(raw);

    expect(result.data).toBeDefined();
    expect(result.data!.bags[0].discountTotal).toBe(0);
  });

  it("maps discounts[] with all fields from Violet response", () => {
    const raw = makeCartWithAppliedDiscount();
    const result = parseAndTransformCart(raw);

    const discount = result.data!.bags[0].discounts[0];
    expect(discount).toEqual({
      id: "5001",
      bagId: "100",
      status: "APPLIED",
      type: "CODE",
      code: "20POFF",
      valueType: "PERCENTAGE",
      amountTotal: 1000,
      dateCreated: "2026-04-14T12:00:00Z",
    });
  });

  it("defaults discounts to empty array when Violet omits it", () => {
    const raw = makeVioletCartResponse();
    delete (raw.bags as Array<Record<string, unknown>>)[0].discounts;
    const result = parseAndTransformCart(raw);

    expect(result.data!.bags[0].discounts).toEqual([]);
  });

  it("defaults discount status to PENDING when Violet omits it", () => {
    const raw = makeVioletCartResponse({
      bags: [
        {
          id: 100,
          merchant_id: 50,
          merchant_name: "Test",
          skus: [],
          subtotal: 0,
          tax: 0,
          shipping_total: 0,
          discount_total: 0,
          errors: [],
          discounts: [{ id: 5001, bag_id: 100, code: "WOOCOMMERCE_PENDING" }],
        },
      ],
    });
    const result = parseAndTransformCart(raw);

    expect(result.data!.bags[0].discounts[0].status).toBe("PENDING");
    expect(result.data!.bags[0].discounts[0].type).toBe("CODE");
  });

  it("calculates total correctly: subtotal + tax + shipping - discountTotal", () => {
    // Single bag: subtotal=5000, tax=320, shipping=599, discount=1000
    const raw = makeCartWithAppliedDiscount();
    const result = parseAndTransformCart(raw);

    expect(result.data!.total).toBe(5000 + 320 + 599 - 1000); // 4919
  });

  it("calculates total correctly for multi-bag with mixed discounts", () => {
    const raw = makeMultiBagCartWithDiscounts();
    const result = parseAndTransformCart(raw);

    // Bag 1: 5000 + 360 + 599 - 500 = 5459
    // Bag 2: 3000 + 180 + 399 - 300 = 3279
    // Total: 5459 + 3279 = 8738
    expect(result.data!.total).toBe(8738);
  });

  it("calculates total correctly with no discounts (backward compatible)", () => {
    const raw = makeVioletCartResponse();
    const result = parseAndTransformCart(raw);

    // subtotal=5000 + tax=400 + shipping=599 - discount=0 = 5999
    expect(result.data!.total).toBe(5999);
  });

  it("handles INVALID discount status correctly", () => {
    const raw = makeVioletCartResponse({
      bags: [
        {
          id: 100,
          merchant_id: 50,
          merchant_name: "Test",
          skus: [{ id: 200, sku_id: 300, quantity: 1, price: 2500 }],
          subtotal: 2500,
          tax: 0,
          shipping_total: 0,
          discount_total: 0,
          errors: [],
          discounts: [
            {
              id: 5002,
              bag_id: 100,
              status: "INVALID",
              type: "CODE",
              code: "EXPIRED_CODE",
              date_created: "2026-04-14T12:00:00Z",
            },
          ],
        },
      ],
    });
    const result = parseAndTransformCart(raw);

    const discount = result.data!.bags[0].discounts[0];
    expect(discount.status).toBe("INVALID");
    expect(discount.code).toBe("EXPIRED_CODE");
    expect(result.data!.bags[0].discountTotal).toBe(0);
    expect(result.data!.total).toBe(2500); // No discount applied
  });

  it("handles EXPIRED discount status correctly", () => {
    const raw = makeVioletCartResponse({
      bags: [
        {
          id: 100,
          merchant_id: 50,
          merchant_name: "Test",
          skus: [{ id: 200, sku_id: 300, quantity: 1, price: 2500 }],
          subtotal: 2500,
          tax: 0,
          shipping_total: 0,
          discount_total: 0,
          errors: [],
          discounts: [
            {
              id: 5003,
              bag_id: 100,
              status: "EXPIRED",
              type: "CODE",
              code: "OLD_PROMO",
            },
          ],
        },
      ],
    });
    const result = parseAndTransformCart(raw);

    expect(result.data!.bags[0].discounts[0].status).toBe("EXPIRED");
    expect(result.data!.bags[0].discountTotal).toBe(0);
  });

  it("handles ERROR discount status correctly", () => {
    const raw = makeVioletCartResponse({
      bags: [
        {
          id: 100,
          merchant_id: 50,
          merchant_name: "Test",
          skus: [{ id: 200, sku_id: 300, quantity: 1, price: 2500 }],
          subtotal: 2500,
          tax: 0,
          shipping_total: 0,
          discount_total: 0,
          errors: [],
          discounts: [
            {
              id: 5004,
              bag_id: 100,
              status: "ERROR",
              type: "CODE",
              code: "GLITCH",
            },
          ],
        },
      ],
    });
    const result = parseAndTransformCart(raw);

    expect(result.data!.bags[0].discounts[0].status).toBe("ERROR");
  });

  it("handles PENDING discount status (WooCommerce/ECWID)", () => {
    const raw = makeVioletCartResponse({
      bags: [
        {
          id: 100,
          merchant_id: 50,
          merchant_name: "WooCommerce Store",
          skus: [{ id: 200, sku_id: 300, quantity: 1, price: 2500 }],
          subtotal: 2500,
          tax: 0,
          shipping_total: 0,
          discount_total: 0,
          errors: [],
          discounts: [
            {
              id: 5005,
              bag_id: 100,
              status: "PENDING",
              type: "CODE",
              code: "WOO_DISCOUNT",
            },
          ],
        },
      ],
    });
    const result = parseAndTransformCart(raw);

    expect(result.data!.bags[0].discounts[0].status).toBe("PENDING");
    expect(result.data!.bags[0].discountTotal).toBe(0); // Not yet applied
  });

  it("handles NOT_SUPPORTED discount status", () => {
    const raw = makeVioletCartResponse({
      bags: [
        {
          id: 100,
          merchant_id: 50,
          merchant_name: "Test",
          skus: [],
          subtotal: 0,
          tax: 0,
          shipping_total: 0,
          discount_total: 0,
          errors: [],
          discounts: [
            {
              id: 5006,
              bag_id: 100,
              status: "NOT_SUPPORTED",
              type: "CODE",
              code: "PLATFORM_NO_DISCOUNT",
            },
          ],
        },
      ],
    });
    const result = parseAndTransformCart(raw);

    expect(result.data!.bags[0].discounts[0].status).toBe("NOT_SUPPORTED");
  });

  it("handles multiple discounts per bag", () => {
    const raw = makeVioletCartResponse({
      bags: [
        {
          id: 100,
          merchant_id: 50,
          merchant_name: "WooCommerce Store",
          skus: [{ id: 200, sku_id: 300, quantity: 1, price: 5000 }],
          subtotal: 5000,
          tax: 400,
          shipping_total: 599,
          discount_total: 1500,
          errors: [],
          discounts: [
            {
              id: 5010,
              bag_id: 100,
              status: "APPLIED",
              type: "CODE",
              code: "SAVE20",
              value_type: "PERCENTAGE",
              amount_total: 1000,
            },
            {
              id: 5011,
              bag_id: 100,
              status: "APPLIED",
              type: "CODE",
              code: "FLAT500",
              value_type: "AMOUNT",
              amount_total: 500,
            },
          ],
        },
      ],
    });
    const result = parseAndTransformCart(raw);

    expect(result.data!.bags[0].discounts).toHaveLength(2);
    expect(result.data!.bags[0].discountTotal).toBe(1500);
    expect(result.data!.total).toBe(5000 + 400 + 599 - 1500); // 4499
  });

  it("does not set valueType/amountTotal when not provided (pre-pricing)", () => {
    const raw = makeVioletCartResponse({
      bags: [
        {
          id: 100,
          merchant_id: 50,
          merchant_name: "Test",
          skus: [{ id: 200, sku_id: 300, quantity: 1, price: 2500 }],
          subtotal: 2500,
          tax: 0,
          shipping_total: 0,
          discount_total: 0,
          errors: [],
          discounts: [
            {
              id: 5007,
              bag_id: 100,
              status: "PENDING",
              type: "CODE",
              code: "BEFORE_PRICING",
              date_created: "2026-04-14T12:00:00Z",
            },
          ],
        },
      ],
    });
    const result = parseAndTransformCart(raw);

    const discount = result.data!.bags[0].discounts[0];
    expect(discount.valueType).toBeUndefined();
    expect(discount.amountTotal).toBeUndefined();
  });
});

// ─── Schema tests (violetDiscountSchema) ─────────────────────────────────────

describe("violetDiscountSchema — validation", () => {
  // Import the schema directly for isolated testing
  let violetDiscountSchema: import("zod/v4").ZodTypeAny;

  beforeEach(async () => {
    const mod = await import("../../schemas/cart.schema.js");
    violetDiscountSchema = mod.violetDiscountSchema;
  });

  it("parses a full APPLIED discount response", () => {
    const result = violetDiscountSchema.safeParse({
      id: 5001,
      bag_id: 100,
      status: "APPLIED",
      type: "CODE",
      code: "20POFF",
      value_type: "PERCENTAGE",
      amount_total: 1000,
      date_created: "2026-04-14T12:00:00Z",
      date_last_modified: "2026-04-14T12:01:00Z",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      const data = result.data as Record<string, unknown>;
      expect(data.id).toBe(5001);
      expect(data.status).toBe("APPLIED");
      expect(data.code).toBe("20POFF");
      expect(data.value_type).toBe("PERCENTAGE");
      expect(data.amount_total).toBe(1000);
    }
  });

  it("parses a minimal PENDING discount (pre-pricing)", () => {
    const result = violetDiscountSchema.safeParse({
      id: 5002,
      bag_id: 100,
      code: "WOO_DISCOUNT",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      const data = result.data as Record<string, unknown>;
      expect(data.status).toBe("PENDING"); // default
      expect(data.type).toBe("CODE"); // default
      expect(data.value_type).toBeUndefined();
      expect(data.amount_total).toBeUndefined();
    }
  });

  it("accepts all 6 discount statuses", () => {
    const statuses = ["PENDING", "APPLIED", "INVALID", "NOT_SUPPORTED", "ERROR", "EXPIRED"];

    for (const status of statuses) {
      const result = violetDiscountSchema.safeParse({
        id: 5000,
        bag_id: 100,
        status,
        code: "TEST",
      });
      expect(result.success, `Status ${status} should be valid`).toBe(true);
    }
  });

  it("rejects invalid status values", () => {
    const result = violetDiscountSchema.safeParse({
      id: 5000,
      bag_id: 100,
      status: "UNKNOWN_STATUS",
      code: "TEST",
    });

    expect(result.success).toBe(false);
  });

  it("defaults non-negative for amount_total", () => {
    const result = violetDiscountSchema.safeParse({
      id: 5000,
      bag_id: 100,
      code: "TEST",
      amount_total: -100,
    });

    expect(result.success).toBe(false);
  });
});
