import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { VioletAdapter } from "../violetAdapter.js";
import type { VioletTokenManager } from "../../clients/violetAuth.js";

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
        skus: [{ id: 200, sku_id: 300, quantity: 2, price: 1999 }],
        subtotal: 3998,
        tax: 0,
        shipping_total: 0,
        errors: [],
      },
    ],
    errors: [],
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("VioletAdapter — cart methods", () => {
  let adapter: VioletAdapter;
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Set VIOLET_APP_ID for getAppId()
    process.env.VIOLET_APP_ID = "12345";

    adapter = new VioletAdapter(createMockTokenManager(), "https://test-api.violet.io/v1");
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.VIOLET_APP_ID;
  });

  // ── createCart ────────────────────────────────────────────────────

  describe("createCart", () => {
    it("calls POST /checkout/cart with channel_id and currency", async () => {
      const violetResponse = makeVioletCartResponse({ bags: [], errors: [] });
      fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(violetResponse), { status: 200 }));

      await adapter.createCart({ userId: null, sessionId: "session-1" });

      expect(fetchSpy).toHaveBeenCalledWith(
        "https://test-api.violet.io/v1/checkout/cart",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ channel_id: 12345, currency: "USD", wallet_based_checkout: true }),
        }),
      );
    });

    it("transforms the Violet response to internal Cart type", async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify(makeVioletCartResponse()), { status: 200 }),
      );

      const result = await adapter.createCart({ userId: null, sessionId: "session-1" });

      expect(result.error).toBeNull();
      expect(result.data?.violetCartId).toBe("999");
      expect(result.data?.bags).toHaveLength(1);
      expect(result.data?.bags[0].merchantName).toBe("Test Merchant");
      expect(result.data?.bags[0].items).toHaveLength(1);
      expect(result.data?.bags[0].items[0].skuId).toBe("300");
      expect(result.data?.bags[0].items[0].quantity).toBe(2);
    });

    it("returns error when VIOLET_APP_ID is missing", async () => {
      delete process.env.VIOLET_APP_ID;

      const result = await adapter.createCart({ userId: null, sessionId: "session-1" });

      expect(result.data).toBeNull();
      expect(result.error?.code).toBe("VIOLET.CONFIG_MISSING");
    });
  });

  // ── addToCart ─────────────────────────────────────────────────────

  describe("addToCart", () => {
    it("calls POST /checkout/cart/{id}/skus with sku_id, quantity, app_id", async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify(makeVioletCartResponse()), { status: 200 }),
      );

      await adapter.addToCart("999", { skuId: "300", quantity: 3 });

      expect(fetchSpy).toHaveBeenCalledWith(
        "https://test-api.violet.io/v1/checkout/cart/999/skus",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ sku_id: 300, quantity: 3, app_id: 12345 }),
        }),
      );
    });

    it("returns transformed cart on success", async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify(makeVioletCartResponse()), { status: 200 }),
      );

      const result = await adapter.addToCart("999", { skuId: "300", quantity: 1 });

      expect(result.error).toBeNull();
      expect(result.data?.violetCartId).toBe("999");
      expect(result.data?.total).toBe(3998); // subtotal from bag
    });
  });

  // ── 200-with-errors pattern ───────────────────────────────────────

  describe("200-with-errors pattern", () => {
    it("returns cart with per-bag errors when Violet responds 200 with errors array", async () => {
      const responseWithErrors = makeVioletCartResponse({
        bags: [
          {
            id: 100,
            merchant_id: 50,
            merchant_name: "Test Merchant",
            skus: [{ id: 200, sku_id: 300, quantity: 1, price: 1999 }],
            subtotal: 1999,
            tax: 0,
            shipping_total: 0,
            errors: [{ code: "OUT_OF_STOCK", message: "Item 300 is out of stock", sku_id: 300 }],
          },
        ],
        errors: [],
      });

      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify(responseWithErrors), { status: 200 }),
      );

      const result = await adapter.addToCart("999", { skuId: "300", quantity: 1 });

      expect(result.error).toBeNull(); // HTTP 200 — not an error at transport level
      expect(result.data?.bags[0].errors).toHaveLength(1);
      expect(result.data?.bags[0].errors[0].code).toBe("OUT_OF_STOCK");
      expect(result.data?.bags[0].errors[0].message).toBe("Item 300 is out of stock");
      expect(result.data?.bags[0].errors[0].skuId).toBe("300");
    });
  });

  // ── updateCartItem ────────────────────────────────────────────────

  describe("updateCartItem", () => {
    it("calls PUT /checkout/cart/{id}/skus/{skuId} with quantity", async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify(makeVioletCartResponse()), { status: 200 }),
      );

      await adapter.updateCartItem("999", "300", 5);

      expect(fetchSpy).toHaveBeenCalledWith(
        "https://test-api.violet.io/v1/checkout/cart/999/skus/300",
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({ quantity: 5 }),
        }),
      );
    });
  });

  // ── removeFromCart ────────────────────────────────────────────────

  describe("removeFromCart", () => {
    it("calls DELETE /checkout/cart/{id}/skus/{skuId}", async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify(makeVioletCartResponse({ bags: [] })), { status: 200 }),
      );

      await adapter.removeFromCart("999", "300");

      expect(fetchSpy).toHaveBeenCalledWith(
        "https://test-api.violet.io/v1/checkout/cart/999/skus/300",
        expect.objectContaining({ method: "DELETE" }),
      );
    });
  });

  // ── getCart ───────────────────────────────────────────────────────

  describe("getCart", () => {
    it("calls GET /checkout/cart/{id}", async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify(makeVioletCartResponse()), { status: 200 }),
      );

      await adapter.getCart("999");

      expect(fetchSpy).toHaveBeenCalledWith(
        "https://test-api.violet.io/v1/checkout/cart/999",
        expect.objectContaining({ method: "GET" }),
      );
    });

    it("returns error on non-2xx response", async () => {
      fetchSpy.mockResolvedValueOnce(new Response("Not Found", { status: 404 }));

      const result = await adapter.getCart("999");

      expect(result.data).toBeNull();
      expect(result.error?.code).toBe("VIOLET.NOT_FOUND");
    });
  });

  // ── snake_case → camelCase boundary ──────────────────────────────

  describe("snake_case → camelCase transformation", () => {
    it("never exposes raw Violet field names in the Cart type", async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify(makeVioletCartResponse()), { status: 200 }),
      );

      const result = await adapter.getCart("999");
      const bag = result.data?.bags[0];

      // camelCase fields present
      expect(bag).toHaveProperty("merchantId");
      expect(bag).toHaveProperty("merchantName");
      expect(bag).toHaveProperty("shippingTotal");
      expect(bag?.items[0]).toHaveProperty("skuId");
      expect(bag?.items[0]).toHaveProperty("unitPrice");

      // snake_case fields must NOT be present
      expect(bag).not.toHaveProperty("merchant_id");
      expect(bag).not.toHaveProperty("merchant_name");
      expect(bag).not.toHaveProperty("shipping_total");
      expect(bag?.items[0]).not.toHaveProperty("sku_id");
    });
  });

  // ── submitOrder ───────────────────────────────────────────────────

  describe("submitOrder", () => {
    it("returns COMPLETED status on success", async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 230715,
            status: "COMPLETED",
            bags: [{ id: 100, status: "ACCEPTED", financial_status: "PAID", total: 20100 }],
          }),
          { status: 200 },
        ),
      );

      const result = await adapter.submitOrder("999", "uuid-idempotency-key");

      expect(result.error).toBeNull();
      expect(result.data?.status).toBe("COMPLETED");
      expect(result.data?.id).toBe("230715");
    });

    /**
     * Regression test for the payment_status bug.
     *
     * Violet signals 3DS via `payment_status: "REQUIRES_ACTION"` (not `status`).
     * The adapter must promote this to `OrderSubmitResult.status` so the checkout
     * handler can detect it via `result.data.status === "REQUIRES_ACTION"`.
     *
     * @see https://docs.violet.io/prism/checkout-guides/guides/violet-checkout-with-stripejs-v3
     */
    it("maps payment_status REQUIRES_ACTION to result.data.status for 3DS detection", async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 230716,
            status: "IN_PROGRESS",
            payment_status: "REQUIRES_ACTION",
            payment_intent_client_secret: "pi_test_secret_3ds",
            bags: [{ id: 101, status: "IN_PROGRESS", financial_status: "UNPAID", total: 20100 }],
          }),
          { status: 200 },
        ),
      );

      const result = await adapter.submitOrder("999", "uuid-idempotency-key");

      expect(result.error).toBeNull();
      expect(result.data?.status).toBe("REQUIRES_ACTION");
      expect(result.data?.paymentIntentClientSecret).toBe("pi_test_secret_3ds");
    });

    it("falls back to status field when payment_status is absent", async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 230717,
            status: "REJECTED",
            bags: [],
          }),
          { status: 200 },
        ),
      );

      const result = await adapter.submitOrder("999", "uuid-idempotency-key");

      expect(result.error).toBeNull();
      expect(result.data?.status).toBe("REJECTED");
    });

    it("returns error on 200-with-errors pattern", async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            errors: [{ message: "Inventory unavailable for SKU 300" }],
          }),
          { status: 200 },
        ),
      );

      const result = await adapter.submitOrder("999", "uuid-idempotency-key");

      expect(result.data).toBeNull();
      expect(result.error?.code).toBe("VIOLET.ORDER_ERROR");
      expect(result.error?.message).toContain("Inventory unavailable");
    });
  });
});
