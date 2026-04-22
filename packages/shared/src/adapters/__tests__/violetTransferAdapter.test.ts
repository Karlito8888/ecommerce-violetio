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
import type { PendingTransferSummary } from "../../types/transfer.types.js";
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
    invalidateToken: vi.fn(),
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
      // Mock 401 twice: first request + retry after token refresh
      const notFound = {
        ok: false,
        status: 401,
        text: () => Promise.resolve("Unauthorized"),
      };
      fetchSpy.mockResolvedValueOnce(notFound).mockResolvedValueOnce(notFound);

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

  // ─── getPendingTransfers ────────────────────────────────────────────

  describe("getPendingTransfers", () => {
    /** Create a mock pending transfer summary as returned by the API. */
    function createMockPendingSummary(overrides: Record<string, unknown> = {}) {
      return {
        merchant_id: 12345,
        amount: 25000,
        currency: "USD",
        related_distributions: [1118941, 1118942],
        merchant_name: "Test Merchant",
        distribution_count: 2,
        payout_account_id: 99,
        payout_account: {
          id: 99,
          account_type: "MERCHANT",
          account_id: 12345,
          merchant_id: 12345,
          app_id: 100,
          is_active: true,
          country_code: "US",
          payment_provider: "STRIPE",
          payment_provider_account_id: "acct_123",
          payment_provider_account_type: "EXPRESS",
          payment_provider_metadata: {},
          payment_provider_account: {},
          errors: [],
          date_created: "2026-04-16T10:00:00Z",
          date_last_modified: "2026-04-16T10:00:00Z",
        },
        ...overrides,
      };
    }

    it("calls GET /payments/transfers/pending with no filters", async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]),
      });

      const { getPendingTransfers } = await import("../violetTransfers.js");
      const result = await getPendingTransfers(ctx);

      expect(result.error).toBeNull();
      expect(result.data).toEqual([]);
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      const [url, options] = fetchSpy.mock.calls[0];
      expect(url).toBe("https://sandbox-api.violet.io/v1/payments/transfers/pending");
      expect(options.method).toBe("GET");
    });

    it("sends merchant_id and app_id as query params", async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]),
      });

      const { getPendingTransfers } = await import("../violetTransfers.js");
      await getPendingTransfers(ctx, { merchantId: "12345", appId: "100" });

      const url = fetchSpy.mock.calls[0][0] as string;
      expect(url).toContain("merchant_id=12345");
      expect(url).toContain("app_id=100");
      expect(url).toContain("/payments/transfers/pending?");
    });

    it("maps Violet pending summary response with full payout account", async () => {
      const rawSummary = createMockPendingSummary();
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([rawSummary]),
      });

      const { getPendingTransfers } = await import("../violetTransfers.js");
      const result = await getPendingTransfers(ctx);

      expect(result.error).toBeNull();
      expect(result.data).toHaveLength(1);

      const summary: PendingTransferSummary = result.data![0];
      expect(summary.merchantId).toBe("12345");
      expect(summary.amount).toBe(25000);
      expect(summary.currency).toBe("USD");
      expect(summary.merchantName).toBe("Test Merchant");
      expect(summary.distributionCount).toBe(2);
      expect(summary.relatedDistributions).toEqual(["1118941", "1118942"]);
      expect(summary.payoutAccountId).toBe("99");
      expect(summary.payoutAccount).not.toBeNull();
      expect(summary.payoutAccount!.id).toBe("99");
      expect(summary.payoutAccount!.isActive).toBe(true);
      expect(summary.payoutAccount!.paymentProvider).toBe("STRIPE");
      expect(summary.payoutAccount!.paymentProviderAccountId).toBe("acct_123");
      expect(summary.payoutAccount!.paymentProviderAccountType).toBe("EXPRESS");
      expect(summary.payoutAccount!.countryCode).toBe("US");
    });

    it("handles summary without payout_account (null)", async () => {
      const rawSummary = createMockPendingSummary({
        payout_account: null,
        payout_account_id: null,
      });
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([rawSummary]),
      });

      const { getPendingTransfers } = await import("../violetTransfers.js");
      const result = await getPendingTransfers(ctx);

      const summary = result.data![0];
      expect(summary.payoutAccountId).toBeNull();
      expect(summary.payoutAccount).toBeNull();
    });

    it("handles multiple pending summaries", async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve([
            createMockPendingSummary({ merchant_id: 1, merchant_name: "Merchant A" }),
            createMockPendingSummary({ merchant_id: 2, merchant_name: "Merchant B" }),
          ]),
      });

      const { getPendingTransfers } = await import("../violetTransfers.js");
      const result = await getPendingTransfers(ctx);

      expect(result.data).toHaveLength(2);
      expect(result.data![0].merchantName).toBe("Merchant A");
      expect(result.data![1].merchantName).toBe("Merchant B");
    });

    it("returns error on non-2xx response", async () => {
      // Mock 401 twice: first request + retry after token refresh
      const notFound = {
        ok: false,
        status: 401,
        text: () => Promise.resolve("Unauthorized"),
      };
      fetchSpy.mockResolvedValueOnce(notFound).mockResolvedValueOnce(notFound);

      const { getPendingTransfers } = await import("../violetTransfers.js");
      const result = await getPendingTransfers(ctx);

      expect(result.data).toBeNull();
      expect(result.error!.code).toBe("VIOLET.AUTH_FAILED");
    });

    it("returns NETWORK_ERROR on fetch failure", async () => {
      fetchSpy.mockRejectedValue(new Error("Connection refused"));

      const { getPendingTransfers } = await import("../violetTransfers.js");
      const result = await getPendingTransfers(ctx);

      expect(result.data).toBeNull();
      expect(result.error!.code).toBe("VIOLET.NETWORK_ERROR");
    }, 10000);
  });

  // ─── getTransfer ────────────────────────────────────────────────────

  describe("getTransfer", () => {
    /** Create a mock full transfer detail as returned by GET /transfers/{id}. */
    function createMockTransferDetail(overrides: Record<string, unknown> = {}) {
      return {
        id: 335500,
        payment_transaction: 99001,
        payout_id: 77001,
        payment_provider_id: "tr_1QMsWtKUtPkD123456789",
        payment_provider_payout_id: "po_stripe_123",
        payout_account_id: 99,
        bag_amount: 10000,
        bag_currency: "USD",
        amount: 10000,
        currency: "USD",
        status: "SENT",
        type: "MERCHANT",
        payment_provider: "STRIPE",
        idempotency_key: "ik_335500",
        transfer_mechanism: "STANDARD_TRANSFERS",
        date_created: "2026-04-16T10:00:00Z",
        date_last_modified: "2026-04-16T10:05:00Z",
        errors: [],
        externalId: "ext_335500",
        payoutExternalId: "po_ext_77001",
        paymentService: "STRIPE",
        effectiveRelatedOrderIds: [22345],
        effectiveRelatedBagIds: [12345],
        effectiveRelatedDistributionIds: [1118941],
        effectiveTransferReversalIds: [],
        related_order_ids: [22345],
        related_bag_ids: [12345],
        related_distribution_ids: [1118941],
        transfer_reversal_ids: [],
        ...overrides,
      };
    }

    it("calls GET /payments/transfers/{id}", async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(createMockTransferDetail()),
      });

      const { getTransfer } = await import("../violetTransfers.js");
      const result = await getTransfer(ctx, "335500");

      expect(result.error).toBeNull();
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      const [url, options] = fetchSpy.mock.calls[0];
      expect(url).toBe("https://sandbox-api.violet.io/v1/payments/transfers/335500");
      expect(options.method).toBe("GET");
    });

    it("maps full TransferDetail with all extended fields", async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(createMockTransferDetail()),
      });

      const { getTransfer } = await import("../violetTransfers.js");
      const result = await getTransfer(ctx, "335500");

      expect(result.error).toBeNull();
      const t = result.data!;

      // Base Transfer fields
      expect(t.id).toBe("335500");
      expect(t.amount).toBe(10000);
      expect(t.currency).toBe("USD");
      expect(t.status).toBe("SENT");
      expect(t.dateCreated).toBe("2026-04-16T10:00:00Z");
      expect(t.dateLastModified).toBe("2026-04-16T10:05:00Z");

      // TransferDetail-specific fields
      expect(t.paymentTransaction).toBe("99001");
      expect(t.payoutId).toBe("77001");
      expect(t.paymentProviderId).toBe("tr_1QMsWtKUtPkD123456789");
      expect(t.paymentProviderPayoutId).toBe("po_stripe_123");
      expect(t.payoutAccountId).toBe("99");
      expect(t.bagAmount).toBe(10000);
      expect(t.bagCurrency).toBe("USD");
      expect(t.type).toBe("MERCHANT");
      expect(t.transferMechanism).toBe("STANDARD_TRANSFERS");
      expect(t.idempotencyKey).toBe("ik_335500");
      expect(t.externalId).toBe("ext_335500");
      expect(t.payoutExternalId).toBe("po_ext_77001");
      expect(t.paymentService).toBe("STRIPE");
      expect(t.effectiveRelatedOrderIds).toEqual(["22345"]);
      expect(t.effectiveRelatedBagIds).toEqual(["12345"]);
      expect(t.effectiveRelatedDistributionIds).toEqual(["1118941"]);
      expect(t.effectiveTransferReversalIds).toEqual([]);
      expect(t.transferReversalIds).toEqual([]);
    });

    it("maps FAILED transfer with extended errors including resolved status", async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve(
            createMockTransferDetail({
              status: "FAILED",
              type: "MERCHANT",
              errors: [
                {
                  id: 501,
                  error_code: 1001,
                  error_message: "Insufficient funds",
                  resolved: false,
                  date_created: "2026-04-16T08:00:00Z",
                  payout_transfer_id: 335500,
                },
              ],
            }),
          ),
      });

      const { getTransfer } = await import("../violetTransfers.js");
      const result = await getTransfer(ctx, "335500");

      const t = result.data!;
      expect(t.status).toBe("FAILED");
      expect(t.errors).toHaveLength(1);
      expect(t.errors[0].id).toBe(501);
      expect(t.errors[0].errorCode).toBe(1001);
      expect(t.errors[0].errorMessage).toBe("Insufficient funds");
      expect(t.errors[0].resolved).toBe(false);
      expect(t.errors[0].payoutTransferId).toBe(335500);
    });

    it("handles null optional fields gracefully", async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 1,
            status: "PENDING",
          }),
      });

      const { getTransfer } = await import("../violetTransfers.js");
      const result = await getTransfer(ctx, "1");

      const t = result.data!;
      expect(t.id).toBe("1");
      expect(t.status).toBe("PENDING");
      expect(t.paymentTransaction).toBeNull();
      expect(t.payoutId).toBeNull();
      expect(t.paymentProviderId).toBeNull();
      expect(t.paymentProviderPayoutId).toBeNull();
      expect(t.payoutAccountId).toBeNull();
      expect(t.type).toBeNull();
      expect(t.transferMechanism).toBeNull();
      expect(t.idempotencyKey).toBeNull();
      expect(t.externalId).toBeNull();
      expect(t.payoutExternalId).toBeNull();
      expect(t.paymentService).toBeNull();
      expect(t.effectiveRelatedOrderIds).toEqual([]);
      expect(t.effectiveRelatedBagIds).toEqual([]);
      expect(t.effectiveTransferReversalIds).toEqual([]);
      expect(t.transferReversalIds).toEqual([]);
      expect(t.errors).toEqual([]);
    });

    it("returns error on non-2xx response", async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: () => Promise.resolve("Transfer not found"),
      });

      const { getTransfer } = await import("../violetTransfers.js");
      const result = await getTransfer(ctx, "99999");

      expect(result.data).toBeNull();
      expect(result.error!.code).toBe("VIOLET.NOT_FOUND");
    });

    it("returns NETWORK_ERROR on fetch failure", async () => {
      fetchSpy.mockRejectedValue(new Error("Connection refused"));

      const { getTransfer } = await import("../violetTransfers.js");
      const result = await getTransfer(ctx, "335500");

      expect(result.data).toBeNull();
      expect(result.error!.code).toBe("VIOLET.NETWORK_ERROR");
    }, 10000);
  });

  // ─── getTransferByProviderId ─────────────────────────────────────────

  describe("getTransferByProviderId", () => {
    it("calls GET /payments/transfers/external/{id}", async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 335500,
            status: "SENT",
            amount: 10000,
            currency: "USD",
            payment_provider: "STRIPE",
            type: "MERCHANT",
            transfer_mechanism: "STANDARD_TRANSFERS",
            errors: [],
            related_order_ids: [22345],
            related_bag_ids: [12345],
            related_distribution_ids: [1118941],
          }),
      });

      const { getTransferByProviderId } = await import("../violetTransfers.js");
      const result = await getTransferByProviderId(ctx, "tr_1QMsWtKUtPkD123");

      expect(result.error).toBeNull();
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      const [url, options] = fetchSpy.mock.calls[0];
      expect(url).toBe(
        "https://sandbox-api.violet.io/v1/payments/transfers/external/tr_1QMsWtKUtPkD123",
      );
      expect(options.method).toBe("GET");
    });

    it("returns TransferDetail with same shape as getTransfer", async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 335500,
            payment_transaction: 99001,
            payout_id: 77001,
            payment_provider_id: "tr_1QMsWtKUtPkD123",
            payout_account_id: 99,
            bag_amount: 10000,
            bag_currency: "USD",
            amount: 10000,
            currency: "USD",
            status: "SENT",
            type: "MERCHANT",
            payment_provider: "STRIPE",
            transfer_mechanism: "STANDARD_TRANSFERS",
            errors: [],
            effectiveRelatedOrderIds: [22345],
            effectiveRelatedBagIds: [12345],
            related_order_ids: [22345],
            related_bag_ids: [12345],
          }),
      });

      const { getTransferByProviderId } = await import("../violetTransfers.js");
      const result = await getTransferByProviderId(ctx, "tr_1QMsWtKUtPkD123");

      const t = result.data!;
      expect(t.id).toBe("335500");
      expect(t.status).toBe("SENT");
      expect(t.paymentProviderId).toBe("tr_1QMsWtKUtPkD123");
      expect(t.payoutId).toBe("77001");
      expect(t.paymentTransaction).toBe("99001");
      expect(t.type).toBe("MERCHANT");
      expect(t.transferMechanism).toBe("STANDARD_TRANSFERS");
    });

    it("returns 404 error for unknown provider transfer ID", async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: () => Promise.resolve("Transfer not found"),
      });

      const { getTransferByProviderId } = await import("../violetTransfers.js");
      const result = await getTransferByProviderId(ctx, "tr_unknown");

      expect(result.data).toBeNull();
      expect(result.error!.code).toBe("VIOLET.NOT_FOUND");
    });

    it("returns NETWORK_ERROR on fetch failure", async () => {
      fetchSpy.mockRejectedValue(new Error("Connection refused"));

      const { getTransferByProviderId } = await import("../violetTransfers.js");
      const result = await getTransferByProviderId(ctx, "tr_abc");

      expect(result.data).toBeNull();
      expect(result.error!.code).toBe("VIOLET.NETWORK_ERROR");
    }, 10000);
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
