import { describe, expect, it } from "vitest";
import {
  webhookEventTypeSchema,
  violetOrderWebhookPayloadSchema,
  violetBagWebhookPayloadSchema,
} from "../webhook.schema";

describe("webhookEventTypeSchema — order/bag events", () => {
  const orderEvents = [
    "ORDER_UPDATED",
    "ORDER_COMPLETED",
    "ORDER_CANCELED",
    "ORDER_REFUNDED",
    "ORDER_RETURNED",
  ];

  const bagEvents = [
    "BAG_SUBMITTED",
    "BAG_ACCEPTED",
    "BAG_SHIPPED",
    "BAG_COMPLETED",
    "BAG_CANCELED",
    "BAG_REFUNDED",
  ];

  it.each(orderEvents)("accepts ORDER event type: %s", (type) => {
    expect(webhookEventTypeSchema.safeParse(type).success).toBe(true);
  });

  it.each(bagEvents)("accepts BAG event type: %s", (type) => {
    expect(webhookEventTypeSchema.safeParse(type).success).toBe(true);
  });

  it("rejects unknown event types", () => {
    expect(webhookEventTypeSchema.safeParse("CART_UPDATED").success).toBe(false);
    expect(webhookEventTypeSchema.safeParse("ORDER_SHIPPED").success).toBe(false);
    expect(webhookEventTypeSchema.safeParse("").success).toBe(false);
  });
});

describe("violetOrderWebhookPayloadSchema", () => {
  it("accepts valid order payload", () => {
    const result = violetOrderWebhookPayloadSchema.safeParse({
      id: 12345,
      status: "COMPLETED",
      app_order_id: "abc-123",
      customer_id: 999,
      date_last_modified: "2026-03-16T10:00:00Z",
    });
    expect(result.success).toBe(true);
  });

  it("accepts payload with only required fields", () => {
    const result = violetOrderWebhookPayloadSchema.safeParse({
      id: 12345,
      status: "CANCELED",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing id", () => {
    const result = violetOrderWebhookPayloadSchema.safeParse({
      status: "COMPLETED",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing status", () => {
    const result = violetOrderWebhookPayloadSchema.safeParse({
      id: 12345,
    });
    expect(result.success).toBe(false);
  });

  it("accepts undocumented status values (z.string, not enum)", () => {
    const result = violetOrderWebhookPayloadSchema.safeParse({
      id: 12345,
      status: "SOME_UNDOCUMENTED_STATUS",
    });
    expect(result.success).toBe(true);
  });
});

describe("violetBagWebhookPayloadSchema", () => {
  it("accepts valid bag payload with tracking info", () => {
    const result = violetBagWebhookPayloadSchema.safeParse({
      id: 67890,
      order_id: 12345,
      status: "SHIPPED",
      financial_status: "PAID",
      merchant_id: 42,
      merchant_name: "Test Merchant",
      tracking_number: "1Z999AA10123456784",
      tracking_url: "https://tracking.example.com/1Z999AA10123456784",
      carrier: "UPS",
      date_last_modified: "2026-03-16T10:00:00Z",
    });
    expect(result.success).toBe(true);
  });

  it("accepts bag payload without tracking info", () => {
    const result = violetBagWebhookPayloadSchema.safeParse({
      id: 67890,
      order_id: 12345,
      status: "ACCEPTED",
      merchant_id: 42,
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing order_id", () => {
    const result = violetBagWebhookPayloadSchema.safeParse({
      id: 67890,
      status: "SHIPPED",
      merchant_id: 42,
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing merchant_id", () => {
    const result = violetBagWebhookPayloadSchema.safeParse({
      id: 67890,
      order_id: 12345,
      status: "SHIPPED",
    });
    expect(result.success).toBe(false);
  });

  it("accepts undocumented status values", () => {
    const result = violetBagWebhookPayloadSchema.safeParse({
      id: 67890,
      order_id: 12345,
      status: "SOME_NEW_BAG_STATUS",
      merchant_id: 42,
    });
    expect(result.success).toBe(true);
  });
});
