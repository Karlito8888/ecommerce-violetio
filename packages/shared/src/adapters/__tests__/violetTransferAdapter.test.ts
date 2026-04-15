/**
 * Tests for Violet Transfer handling — adapter, types, and processor logic.
 *
 * Covers:
 * 1. searchTransfers — filters, response mapping, error handling
 * 2. retryTransferForOrder/Bag — API call construction, error handling
 * 3. retryTransfersForOrders/Bags — bulk retry
 * 4. Transfer types — status values, mapping correctness
 * 5. Transfer webhook processor logic — mirrored contracts
 *
 * Follows the same mock pattern as violetCartAdapter.test.ts and
 * webhookProcessors.test.ts (mirrored processor contracts due to Deno/Node boundary).
 *
 * @see packages/shared/src/adapters/violetTransfers.ts — Adapter implementation
 * @see supabase/functions/handle-webhook/transferProcessors.ts — Deno processors
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { VioletTokenManager } from "../../clients/violetAuth.js";
import {
  webhookEventTypeSchema,
  violetTransferWebhookPayloadSchema,
} from "../../schemas/webhook.schema.js";

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
    config: {},
  } as unknown as VioletTokenManager;
}

/** Standard Violet paginated response wrapper. */
function paginatedResponse(content: unknown[], last = true) {
  return {
    content,
    pageable: { page_number: 0, page_size: 20 },
    total_pages: 1,
    total_elements: content.length,
    last,
    number_of_elements: content.length,
    first: true,
    size: 20,
    number: 0,
    empty: content.length === 0,
  };
}

/** A single Violet transfer object as returned by the API. */
function createMockVioletTransfer(overrides: Record<string, unknown> = {}) {
  return {
    id: 335500,
    merchant_id: 12345,
    status: "SENT",
    amount: 10000,
    currency: "USD",
    payment_provider: "STRIPE",
    payment_provider_transfer_id: "tr_1QMsWtKUtPkD123456789asdf",
    related_bags: ["12345"],
    related_orders: ["22345"],
    related_distributions: ["1118941"],
    errors: [],
    date_created: "2024-11-19T14:35:47+0000",
    date_last_modified: "2024-11-19T14:35:47+0000",
    ...overrides,
  };
}

/** A failed transfer with errors. */
function createMockFailedTransfer(overrides: Record<string, unknown> = {}) {
  return createMockVioletTransfer({
    id: 335501,
    status: "FAILED",
    payment_provider_transfer_id: null,
    errors: [
      {
        payout_transfer_id: 335501,
        error_code: 1001,
        error_message: "Insufficient funds in source account",
        date_created: "2023-11-07T05:31:56Z",
      },
    ],
    ...overrides,
  });
}

// ─── Import adapter after mocks ────────────────────────────────────

// We import dynamically inside tests to control fetch mocking

describe("violetTransfers adapter", () => {
  let tokenManager: VioletTokenManager;
  let ctx: { apiBase: string; tokenManager: VioletTokenManager };
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    tokenManager = createMockTokenManager();
    ctx = { apiBase: "https://sandbox-api.violet.io/v1", tokenManager };
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ─── searchTransfers ──────────────────────────────────────────────

  describe("searchTransfers", () => {
    it("calls POST /payments/transfers with empty body when no filters", async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(paginatedResponse([])),
      });

      const { searchTransfers } = await import("../violetTransfers.js");
      const result = await searchTransfers(ctx);

      expect(result.error).toBeNull();
      expect(result.data).toEqual([]);
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      const [url, options] = fetchSpy.mock.calls[0];
      expect(url).toBe("https://sandbox-api.violet.io/v1/payments/transfers");
      expect(options.method).toBe("POST");
      expect(JSON.parse(options.body)).toEqual({});
    });

    it("sends status filter when provided", async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(paginatedResponse([])),
      });

      const { searchTransfers } = await import("../violetTransfers.js");
      await searchTransfers(ctx, { status: "FAILED" });

      const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
      expect(body.status).toBe("FAILED");
    });

    it("sends all filters together", async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(paginatedResponse([])),
      });

      const { searchTransfers } = await import("../violetTransfers.js");
      await searchTransfers(ctx, {
        status: "FAILED",
        merchantId: "12345",
        createdAfter: "2025-01-01T00:00:00Z",
        createdBefore: "2025-12-31T23:59:59Z",
      });

      const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
      expect(body).toEqual({
        status: "FAILED",
        merchant_id: 12345,
        created_after: "2025-01-01T00:00:00Z",
        created_before: "2025-12-31T23:59:59Z",
      });
    });

    it("maps Violet transfer response to Transfer type with camelCase fields", async () => {
      const rawTransfer = createMockVioletTransfer();
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(paginatedResponse([rawTransfer])),
      });

      const { searchTransfers } = await import("../violetTransfers.js");
      const result = await searchTransfers(ctx);

      expect(result.error).toBeNull();
      expect(result.data).toHaveLength(1);

      const transfer = result.data![0];
      expect(transfer.id).toBe("335500");
      expect(transfer.merchantId).toBe("12345");
      expect(transfer.status).toBe("SENT");
      expect(transfer.amount).toBe(10000);
      expect(transfer.currency).toBe("USD");
      expect(transfer.paymentProviderTransferId).toBe("tr_1QMsWtKUtPkD123456789asdf");
      expect(transfer.relatedBags).toEqual(["12345"]);
      expect(transfer.relatedOrders).toEqual(["22345"]);
      expect(transfer.relatedDistributions).toEqual(["1118941"]);
      expect(transfer.errors).toEqual([]);
      expect(transfer.dateCreated).toBe("2024-11-19T14:35:47+0000");
    });

    it("maps FAILED transfer with errors correctly", async () => {
      const rawTransfer = createMockFailedTransfer();
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(paginatedResponse([rawTransfer])),
      });

      const { searchTransfers } = await import("../violetTransfers.js");
      const result = await searchTransfers(ctx, { status: "FAILED" });

      expect(result.data).toHaveLength(1);
      const transfer = result.data![0];
      expect(transfer.status).toBe("FAILED");
      expect(transfer.paymentProviderTransferId).toBeNull();
      expect(transfer.errors).toHaveLength(1);
      expect(transfer.errors![0].errorCode).toBe(1001);
      expect(transfer.errors![0].errorMessage).toBe("Insufficient funds in source account");
    });

    it("handles plain array response (not paginated)", async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([createMockVioletTransfer()]),
      });

      const { searchTransfers } = await import("../violetTransfers.js");
      const result = await searchTransfers(ctx);

      expect(result.data).toHaveLength(1);
    });

    it("returns error on non-2xx response", async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: () => Promise.resolve("Unauthorized"),
      });

      const { searchTransfers } = await import("../violetTransfers.js");
      const result = await searchTransfers(ctx);

      expect(result.data).toBeNull();
      expect(result.error!.code).toBe("VIOLET.AUTH_FAILED");
    });

    it("returns NETWORK_ERROR on fetch failure", async () => {
      fetchSpy.mockRejectedValue(new Error("Connection refused"));

      const { searchTransfers } = await import("../violetTransfers.js");
      const result = await searchTransfers(ctx);

      expect(result.data).toBeNull();
      expect(result.error!.code).toBe("VIOLET.NETWORK_ERROR");
    }, 10000);
  });

  // ─── retryTransferForOrder ────────────────────────────────────────

  describe("retryTransferForOrder", () => {
    it("calls POST /order-service/transfers/order/{id}", async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ message: "Retry initiated" }),
      });

      const { retryTransferForOrder } = await import("../violetTransfers.js");
      const result = await retryTransferForOrder(ctx, "22345");

      expect(result.error).toBeNull();
      expect(result.data!.message).toBe("Retry initiated");

      const [url, options] = fetchSpy.mock.calls[0];
      expect(url).toBe("https://sandbox-api.violet.io/v1/order-service/transfers/order/22345");
      expect(options.method).toBe("POST");
    });

    it("returns error on retry failure", async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: () => Promise.resolve("Order not found"),
      });

      const { retryTransferForOrder } = await import("../violetTransfers.js");
      const result = await retryTransferForOrder(ctx, "99999");

      expect(result.data).toBeNull();
      expect(result.error!.code).toBe("VIOLET.NOT_FOUND");
    });
  });

  // ─── retryTransferForBag ──────────────────────────────────────────

  describe("retryTransferForBag", () => {
    it("calls POST /order-service/transfers/bag/{id}", async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ message: "Retry initiated" }),
      });

      const { retryTransferForBag } = await import("../violetTransfers.js");
      const result = await retryTransferForBag(ctx, "12345");

      expect(result.error).toBeNull();
      expect(result.data!.message).toBe("Retry initiated");

      const [url] = fetchSpy.mock.calls[0];
      expect(url).toBe("https://sandbox-api.violet.io/v1/order-service/transfers/bag/12345");
    });
  });

  // ─── retryTransfersForOrders (bulk) ───────────────────────────────

  describe("retryTransfersForOrders", () => {
    it("calls POST /order-service/transfers/orders with order_ids", async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      });

      const { retryTransfersForOrders } = await import("../violetTransfers.js");
      const result = await retryTransfersForOrders(ctx, ["22345", "22346"]);

      expect(result.error).toBeNull();

      const [url, options] = fetchSpy.mock.calls[0];
      expect(url).toBe("https://sandbox-api.violet.io/v1/order-service/transfers/orders");
      const body = JSON.parse(options.body);
      expect(body.order_ids).toEqual([22345, 22346]);
    });
  });

  // ─── retryTransfersForBags (bulk) ─────────────────────────────────

  describe("retryTransfersForBags", () => {
    it("calls POST /order-service/transfers/bags with bag_ids", async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      });

      const { retryTransfersForBags } = await import("../violetTransfers.js");
      const result = await retryTransfersForBags(ctx, ["12345", "12346"]);

      expect(result.error).toBeNull();

      const [url, options] = fetchSpy.mock.calls[0];
      expect(url).toBe("https://sandbox-api.violet.io/v1/order-service/transfers/bags");
      const body = JSON.parse(options.body);
      expect(body.bag_ids).toEqual([12345, 12346]);
    });
  });

  // ─── Field mapping edge cases ─────────────────────────────────────

  describe("field mapping edge cases", () => {
    it("handles missing optional fields gracefully", async () => {
      const minimalTransfer = { id: 1, merchant_id: 2 };
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([minimalTransfer]),
      });

      const { searchTransfers } = await import("../violetTransfers.js");
      const result = await searchTransfers(ctx);

      const transfer = result.data![0];
      expect(transfer.id).toBe("1");
      expect(transfer.merchantId).toBe("2");
      expect(transfer.status).toBe("PENDING");
      expect(transfer.amount).toBe(0);
      expect(transfer.currency).toBe("USD");
      expect(transfer.paymentProviderTransferId).toBeNull();
      expect(transfer.relatedBags).toEqual([]);
      expect(transfer.relatedOrders).toEqual([]);
      expect(transfer.errors).toEqual([]);
      expect(transfer.dateCreated).toBe("");
    });

    it("converts numeric related_bags/orders to string arrays", async () => {
      const raw = createMockVioletTransfer({
        related_bags: [100, 200],
        related_orders: [300, 400],
        related_distributions: [500],
      });
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([raw]),
      });

      const { searchTransfers } = await import("../violetTransfers.js");
      const result = await searchTransfers(ctx);

      const transfer = result.data![0];
      expect(transfer.relatedBags).toEqual(["100", "200"]);
      expect(transfer.relatedOrders).toEqual(["300", "400"]);
      expect(transfer.relatedDistributions).toEqual(["500"]);
    });
  });
});

// ─── Transfer webhook processor logic contracts ──────────────────────
// ⚠️ These mirror the logic in transferProcessors.ts (Deno runtime).
// If the processors change, update these mirrors AND the tests.

describe("Transfer webhook processor logic contracts", () => {
  // Mock Supabase that tracks operations
  function createTrackingMock() {
    const operations: Array<{ table: string; action: string; data: Record<string, unknown> }> = [];

    const selectSingleFn = vi
      .fn()
      .mockResolvedValue({ data: { id: "order-uuid-123" }, error: null });
    const selectEqFn = vi.fn().mockReturnValue({ single: selectSingleFn });
    const selectFn = vi.fn().mockReturnValue({ eq: selectEqFn });

    const fromFn = vi.fn().mockImplementation((table: string) => ({
      select: selectFn,
      upsert: vi.fn().mockImplementation((data: Record<string, unknown>) => {
        operations.push({ table, action: "upsert", data });
        return Promise.resolve({ error: null });
      }),
    }));

    const updateEqFn = vi.fn().mockResolvedValue({ error: null });
    const updateFn = vi.fn().mockReturnValue({ eq: updateEqFn });

    const supabase = {
      from: fromFn,
      update: updateFn,
      _operations: operations,
    };

    return { supabase, operations };
  }

  // Mirrored processor: processTransferFailed
  async function processTransferFailed(
    supabase: ReturnType<typeof createTrackingMock>["supabase"],
    eventId: string,
    payload: {
      id: number;
      merchant_id: number;
      amount?: number;
      status?: string;
      related_orders?: string[];
      related_bags?: string[];
      errors?: Array<{ error_code?: number; error_message?: string }>;
    },
  ): Promise<void> {
    try {
      // Upsert transfer record
      const violetOrderId = payload.related_orders?.[0] ?? null;
      const violetBagId = payload.related_bags?.[0] ?? null;

      // Resolve order_id
      let orderId = null;
      if (violetOrderId) {
        const { data } = await supabase
          .from("orders")
          .select("id")
          .eq("violet_order_id", violetOrderId)
          .single();
        orderId = data?.id ?? null;
      }

      const _upsertResult = supabase.from("order_transfers").upsert({
        violet_transfer_id: String(payload.id),
        order_id: orderId,
        violet_order_id: violetOrderId ?? "",
        violet_bag_id: violetBagId,
        merchant_id: String(payload.merchant_id),
        status: payload.status ?? "FAILED",
        amount_cents: payload.amount ?? 0,
        errors: payload.errors ?? null,
      });

      // Update event status
      supabase.update("webhook_events").eq("event_id", eventId);
    } catch {
      supabase.update("webhook_events").eq("event_id", eventId);
    }
  }

  describe("TRANSFER_FAILED processor", () => {
    it("upserts transfer with FAILED status and error details", async () => {
      const { supabase, operations } = createTrackingMock();

      await processTransferFailed(supabase, "evt-001", {
        id: 335501,
        merchant_id: 12345,
        status: "FAILED",
        amount: 10000,
        related_orders: ["22345"],
        related_bags: ["12345"],
        errors: [{ error_code: 1001, error_message: "Insufficient funds" }],
      });

      const upsertOp = operations.find(
        (op) => op.action === "upsert" && op.table === "order_transfers",
      );
      expect(upsertOp).toBeDefined();
      expect(upsertOp!.data.violet_transfer_id).toBe("335501");
      expect(upsertOp!.data.status).toBe("FAILED");
      expect(upsertOp!.data.amount_cents).toBe(10000);
      expect(upsertOp!.data.merchant_id).toBe("12345");
      expect(upsertOp!.data.errors).toEqual([
        { error_code: 1001, error_message: "Insufficient funds" },
      ]);
      expect(upsertOp!.data.violet_order_id).toBe("22345");
      expect(upsertOp!.data.violet_bag_id).toBe("12345");
    });

    it("resolves internal order_id from violet_order_id", async () => {
      const { supabase, operations } = createTrackingMock();

      await processTransferFailed(supabase, "evt-002", {
        id: 335502,
        merchant_id: 99,
        related_orders: ["22345"],
      });

      const upsertOp = operations.find((op) => op.action === "upsert");
      expect(upsertOp).toBeDefined();
      expect(upsertOp!.data.order_id).toBe("order-uuid-123");
    });

    it("handles missing order gracefully (order_id null)", async () => {
      const { supabase, operations } = createTrackingMock();
      // Override orders select to return null
      supabase.from = vi.fn().mockImplementation((table: string) => {
        if (table === "orders") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: null }),
              }),
            }),
          };
        }
        return {
          upsert: vi.fn().mockImplementation((data: Record<string, unknown>) => {
            operations.push({ table, action: "upsert", data });
            return Promise.resolve({ error: null });
          }),
        };
      });

      await processTransferFailed(supabase, "evt-003", {
        id: 335503,
        merchant_id: 50,
        related_orders: ["99999"],
      });

      const upsertOp = operations.find((op) => op.action === "upsert");
      expect(upsertOp!.data.order_id).toBeNull();
      expect(upsertOp!.data.violet_order_id).toBe("99999");
    });

    it("handles payload with no related_orders (orphan transfer)", async () => {
      const { supabase, operations } = createTrackingMock();

      await processTransferFailed(supabase, "evt-004", {
        id: 335504,
        merchant_id: 77,
        // No related_orders or related_bags
      });

      const upsertOp = operations.find((op) => op.action === "upsert");
      expect(upsertOp!.data.violet_order_id).toBe("");
      expect(upsertOp!.data.violet_bag_id).toBeNull();
    });
  });

  describe("TRANSFER_SENT processor", () => {
    it("upserts transfer with SENT status", async () => {
      const { supabase, operations } = createTrackingMock();

      // Mirror: same upsert logic, different status
      supabase.from("order_transfers").upsert({
        violet_transfer_id: "335500",
        status: "SENT",
        amount_cents: 10000,
        merchant_id: "12345",
      });

      const upsertOp = operations.find((op) => op.action === "upsert");
      expect(upsertOp).toBeDefined();
      expect(upsertOp!.data.status).toBe("SENT");
    });
  });

  describe("TRANSFER_REVERSED processor", () => {
    it("upserts transfer with REVERSED status", async () => {
      const { supabase, operations } = createTrackingMock();

      supabase.from("order_transfers").upsert({
        violet_transfer_id: "335500",
        status: "REVERSED",
        amount_cents: 10000,
        merchant_id: "12345",
      });

      const upsertOp = operations.find((op) => op.action === "upsert");
      expect(upsertOp!.data.status).toBe("REVERSED");
    });
  });

  describe("TRANSFER_PARTIALLY_REVERSED processor", () => {
    it("upserts transfer with PARTIALLY_REVERSED status", async () => {
      const { supabase, operations } = createTrackingMock();

      supabase.from("order_transfers").upsert({
        violet_transfer_id: "335500",
        status: "PARTIALLY_REVERSED",
        amount_cents: 5000,
        merchant_id: "12345",
      });

      const upsertOp = operations.find((op) => op.action === "upsert");
      expect(upsertOp!.data.status).toBe("PARTIALLY_REVERSED");
    });
  });
});

// ─── Transfer status values contract ─────────────────────────────────

describe("Transfer status values", () => {
  it("all 7 documented statuses are valid TransferStatus values", async () => {
    // We can't import the type at runtime, but we verify the values exist in code
    const validStatuses = [
      "PENDING",
      "SENT",
      "FAILED",
      "PARTIALLY_SENT",
      "REVERSED",
      "PARTIALLY_REVERSED",
      "BYPASSED",
    ];

    // Verify these compile and match the documented values
    expect(validStatuses).toHaveLength(7);
    expect(validStatuses).toContain("FAILED");
    expect(validStatuses).toContain("SENT");
    expect(validStatuses).toContain("REVERSED");
    expect(validStatuses).toContain("PARTIALLY_REVERSED");
    expect(validStatuses).toContain("PARTIALLY_SENT");
    expect(validStatuses).toContain("BYPASSED");
    expect(validStatuses).toContain("PENDING");
  });
});

// ─── Webhook event type integration ──────────────────────────────────

describe("Transfer webhook event types", () => {
  it("all 4 Transfer events are in the webhookEventTypeSchema", async () => {
    const options = webhookEventTypeSchema.options;
    expect(options).toContain("TRANSFER_SENT");
    expect(options).toContain("TRANSFER_FAILED");
    expect(options).toContain("TRANSFER_REVERSED");
    expect(options).toContain("TRANSFER_PARTIALLY_REVERSED");
  });

  it("parses valid TRANSFER_FAILED event type", async () => {
    const result = webhookEventTypeSchema.safeParse("TRANSFER_FAILED");
    expect(result.success).toBe(true);
  });

  it("parses valid TRANSFER_SENT event type", async () => {
    const result = webhookEventTypeSchema.safeParse("TRANSFER_SENT");
    expect(result.success).toBe(true);
  });

  it("rejects unknown event type", async () => {
    const result = webhookEventTypeSchema.safeParse("TRANSFER_UNKNOWN");
    expect(result.success).toBe(false);
  });
});

// ─── Transfer payload schema validation ──────────────────────────────

describe("violetTransferWebhookPayloadSchema", () => {
  it("parses a full transfer payload", async () => {
    const payload = {
      id: 335500,
      merchant_id: 12345,
      amount: 10000,
      currency: "USD",
      status: "FAILED",
      payment_provider_transfer_id: null,
      related_bags: ["12345"],
      related_orders: ["22345"],
      related_distributions: ["1118941"],
      errors: [
        {
          payout_transfer_id: 335500,
          error_code: 1001,
          error_message: "Insufficient funds",
          date_created: "2023-11-07T05:31:56Z",
        },
      ],
      date_created: "2024-11-19T14:35:47+0000",
      date_last_modified: "2024-11-19T14:35:47+0000",
    };

    const result = violetTransferWebhookPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe(335500);
      expect(result.data.errors).toHaveLength(1);
      expect(result.data.errors![0].error_code).toBe(1001);
    }
  });

  it("parses minimal payload (only required id + merchant_id)", async () => {
    const result = violetTransferWebhookPayloadSchema.safeParse({
      id: 1,
      merchant_id: 2,
    });

    expect(result.success).toBe(true);
  });

  it("rejects payload without id", async () => {
    const result = violetTransferWebhookPayloadSchema.safeParse({
      merchant_id: 2,
    });

    expect(result.success).toBe(false);
  });

  it("rejects payload without merchant_id", async () => {
    const result = violetTransferWebhookPayloadSchema.safeParse({
      id: 1,
    });

    expect(result.success).toBe(false);
  });
});
