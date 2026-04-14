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

  // ── Quick Checkout ────────────────────────────────────────────────
  // @see https://docs.violet.io/prism/checkout-guides/guides/utilizing-quick-checkout

  describe("createCart — Quick Checkout", () => {
    it("sends SKUs inline when provided", async () => {
      const violetResponse = makeVioletCartResponse({
        bags: [
          {
            id: 100,
            merchant_id: 50,
            merchant_name: "Test",
            skus: [{ id: 200, sku_id: 300, quantity: 1, price: 1999 }],
            subtotal: 1999,
            tax: 0,
            shipping_total: 0,
            errors: [],
          },
        ],
      });
      fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(violetResponse), { status: 200 }));

      await adapter.createCart({
        userId: null,
        sessionId: "session-1",
        skus: [{ skuId: "300", quantity: 1 }],
      });

      const callArgs = fetchSpy.mock.calls[0]!;
      const body = JSON.parse((callArgs[1] as RequestInit).body as string);
      expect(body.skus).toEqual([{ sku_id: 300, quantity: 1 }]);
    });

    it("sends customer + shipping address inline when provided", async () => {
      const violetResponse = makeVioletCartResponse({ bags: [], errors: [] });
      fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(violetResponse), { status: 200 }));

      await adapter.createCart({
        userId: null,
        sessionId: "session-1",
        customer: {
          firstName: "Jean",
          lastName: "Dupont",
          email: "jean@example.com",
          shippingAddress: {
            address1: "1 Rue de Paris",
            city: "Paris",
            state: "",
            postalCode: "75001",
            country: "FR",
          },
        },
      });

      const callArgs = fetchSpy.mock.calls[0]!;
      const body = JSON.parse((callArgs[1] as RequestInit).body as string);
      expect(body.customer).toBeDefined();
      expect(body.customer.first_name).toBe("Jean");
      expect(body.customer.last_name).toBe("Dupont");
      expect(body.customer.email).toBe("jean@example.com");
      expect(body.customer.shipping_address.country).toBe("FR");
      expect(body.customer.same_address).toBe(true); // default
    });

    it("sends billing address when sameAddress is false", async () => {
      const violetResponse = makeVioletCartResponse({ bags: [], errors: [] });
      fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(violetResponse), { status: 200 }));

      await adapter.createCart({
        userId: null,
        sessionId: "session-1",
        customer: {
          firstName: "Jean",
          lastName: "Dupont",
          email: "jean@example.com",
          sameAddress: false,
          shippingAddress: {
            address1: "1 Rue de Paris",
            city: "Paris",
            state: "",
            postalCode: "75001",
            country: "FR",
          },
          billingAddress: {
            address1: "2 Ave des Champs",
            city: "Lyon",
            state: "",
            postalCode: "69001",
            country: "FR",
          },
        },
      });

      const callArgs = fetchSpy.mock.calls[0]!;
      const body = JSON.parse((callArgs[1] as RequestInit).body as string);
      expect(body.customer.same_address).toBe(false);
      expect(body.customer.billing_address).toBeDefined();
      expect(body.customer.billing_address.city).toBe("Lyon");
    });

    it("omits skus and customer when not provided (standard flow)", async () => {
      const violetResponse = makeVioletCartResponse({ bags: [], errors: [] });
      fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(violetResponse), { status: 200 }));

      await adapter.createCart({ userId: null, sessionId: "session-1" });

      const callArgs = fetchSpy.mock.calls[0]!;
      const body = JSON.parse((callArgs[1] as RequestInit).body as string);
      expect(body.skus).toBeUndefined();
      expect(body.customer).toBeUndefined();
      expect(body.channel_id).toBe(12345);
      expect(body.wallet_based_checkout).toBe(true);
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

    it("returns error on 200-with-errors when status is not COMPLETED (total failure)", async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: "IN_PROGRESS",
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

    it("returns data with errors on partial success (COMPLETED + errors)", async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 10000,
            status: "COMPLETED",
            bags: [
              {
                id: 11111,
                status: "ACCEPTED",
                financial_status: "PAID",
                total: 22712,
              },
              {
                id: 22223,
                status: "REJECTED",
                financial_status: "VOIDED",
                total: 10900,
              },
            ],
            errors: [
              {
                bag_id: 22223,
                entity_id: "99999",
                entity_type: "SKU",
                type: "EXTERNAL_SUBMIT_CART",
                message: "This item is no longer available for purchase.",
                platform: "SHOPIFY",
              },
            ],
          }),
          { status: 200 },
        ),
      );

      const result = await adapter.submitOrder("999", "uuid-idempotency-key");

      expect(result.error).toBeNull();
      expect(result.data?.status).toBe("COMPLETED");
      expect(result.data?.bags).toHaveLength(2);
      expect(result.data?.bags[0].status).toBe("ACCEPTED");
      expect(result.data?.bags[1].status).toBe("REJECTED");
      expect(result.data?.errors).toHaveLength(1);
      expect(result.data?.errors?.[0].message).toBe(
        "This item is no longer available for purchase.",
      );
      expect(result.data?.errors?.[0].bagId).toBe("22223");
      expect(result.data?.errors?.[0].skuId).toBe("99999");
      expect(result.data?.errors?.[0].type).toBe("EXTERNAL_SUBMIT_CART");
      expect(result.data?.errors?.[0].externalPlatform).toBe("SHOPIFY");
    });
  });

  // ── priceCart ──────────────────────────────────────────────────────

  describe("priceCart", () => {
    it("calls GET /checkout/cart/{id}/price and returns priced cart", async () => {
      const pricedCart = makeVioletCartResponse({
        bags: [
          {
            id: 100,
            merchant_id: 50,
            merchant_name: "Test Merchant",
            skus: [{ id: 200, sku_id: 300, quantity: 2, price: 1999 }],
            subtotal: 3998,
            tax: 320,
            shipping_total: 599,
            errors: [],
          },
        ],
      });
      fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(pricedCart), { status: 200 }));

      const result = await adapter.priceCart("999");

      expect(fetchSpy).toHaveBeenCalledWith(
        "https://test-api.violet.io/v1/checkout/cart/999/price",
        expect.objectContaining({ method: "GET" }),
      );
      expect(result.error).toBeNull();
      expect(result.data?.bags[0].tax).toBe(320);
      expect(result.data?.bags[0].shippingTotal).toBe(599);
    });

    it("returns error when Violet API fails", async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ message: "Internal Server Error" }), { status: 500 }),
      );

      const result = await adapter.priceCart("999");

      expect(result.data).toBeNull();
      expect(result.error).toBeDefined();
    });

    it("returns error when cart not found", async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ message: "Not Found" }), { status: 404 }),
      );

      const result = await adapter.priceCart("999");

      expect(result.data).toBeNull();
      expect(result.error).toBeDefined();
    });
  });
});
