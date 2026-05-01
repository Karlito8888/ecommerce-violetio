import { describe, it, expect } from "vitest";
import { violetTransferWebhookPayloadSchema } from "../../schemas/webhook.schema.js";

/**
 * Tests for Violet TRANSFER_* webhook payload schema.
 *
 * Validates that the Zod schema correctly handles BOTH error formats
 * returned by Violet:
 * - **Webhook format**: `{ code: "insufficient_funds", message: "..." }`
 * - **Search API format**: `{ error_code: 1001, error_message: "..." }`
 *
 * @see https://docs.violet.io/prism/payments/payments-during-checkout/guides/handling-failed-transfers
 */

describe("violetTransferWebhookPayloadSchema", () => {
  const basePayload = {
    id: 335500,
    merchant_id: 12345,
    amount: 10000,
    currency: "USD",
    status: "FAILED",
    related_bags: ["12345"],
    related_orders: ["22345"],
    related_distributions: ["1118941"],
  };

  it("parses minimal valid payload (all optionals omitted)", () => {
    const result = violetTransferWebhookPayloadSchema.safeParse({
      id: 1,
      merchant_id: 100,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe(1);
      expect(result.data.merchant_id).toBe(100);
      expect(result.data.errors).toBeUndefined();
    }
  });

  it("parses full payload with webhook error format (code/message strings)", () => {
    const payload = {
      ...basePayload,
      errors: [{ code: "insufficient_funds", message: "Insufficient funds in platform account" }],
      date_created: "2023-11-07T05:31:56Z",
      date_last_modified: "2023-11-07T05:31:56Z",
    };

    const result = violetTransferWebhookPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.errors).toHaveLength(1);
      expect(result.data.errors![0].code).toBe("insufficient_funds");
      expect(result.data.errors![0].message).toBe("Insufficient funds in platform account");
    }
  });

  it("parses full payload with Search API error format (error_code/error_message)", () => {
    const payload = {
      ...basePayload,
      errors: [
        {
          payout_transfer_id: 123,
          error_code: 1001,
          error_message: "Insufficient funds in source account",
          date_created: "2023-11-07T05:31:56Z",
        },
      ],
    };

    const result = violetTransferWebhookPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.errors).toHaveLength(1);
      expect(result.data.errors![0].error_code).toBe(1001);
      expect(result.data.errors![0].error_message).toBe("Insufficient funds in source account");
      expect(result.data.errors![0].payout_transfer_id).toBe(123);
    }
  });

  it("parses multiple errors with mixed formats", () => {
    const payload = {
      ...basePayload,
      errors: [
        { code: "insufficient_funds", message: "Not enough funds" },
        { error_code: 2001, error_message: "KYC incomplete" },
      ],
    };

    const result = violetTransferWebhookPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.errors).toHaveLength(2);
      // First error: webhook format
      expect(result.data.errors![0].code).toBe("insufficient_funds");
      expect(result.data.errors![0].message).toBe("Not enough funds");
      // Second error: API format
      expect(result.data.errors![1].error_code).toBe(2001);
      expect(result.data.errors![1].error_message).toBe("KYC incomplete");
    }
  });

  it("captures all TransferStatus values via status field", () => {
    const statuses = [
      "PENDING",
      "SENT",
      "FAILED",
      "PARTIALLY_SENT",
      "REVERSED",
      "PARTIALLY_REVERSED",
      "BYPASSED",
    ];

    for (const status of statuses) {
      const result = violetTransferWebhookPayloadSchema.safeParse({
        ...basePayload,
        status,
      });
      expect(result.success, `Status "${status}" should parse`).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe(status);
      }
    }
  });

  it("handles empty errors array", () => {
    const result = violetTransferWebhookPayloadSchema.safeParse({
      ...basePayload,
      errors: [],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.errors).toHaveLength(0);
    }
  });

  it("handles null payment_provider_transfer_id", () => {
    const result = violetTransferWebhookPayloadSchema.safeParse({
      ...basePayload,
      payment_provider_transfer_id: null,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.payment_provider_transfer_id).toBeNull();
    }
  });

  it("captures related_bags, related_orders, related_distributions", () => {
    const result = violetTransferWebhookPayloadSchema.safeParse({
      ...basePayload,
      related_bags: ["111", "222"],
      related_orders: ["333"],
      related_distributions: ["444", "555", "666"],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.related_bags).toEqual(["111", "222"]);
      expect(result.data.related_orders).toEqual(["333"]);
      expect(result.data.related_distributions).toEqual(["444", "555", "666"]);
    }
  });
});
