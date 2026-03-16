import { describe, it, expect } from "vitest";
import {
  webhookEventTypeSchema,
  violetWebhookHeadersSchema,
  violetRequiredHeadersSchema,
  violetOfferWebhookPayloadSchema,
  violetSyncWebhookPayloadSchema,
} from "../webhook.schema.js";

// ─── Test fixtures ──────────────────────────────────────────────────

const validOfferPayload = {
  id: 12345,
  name: "Premium Wireless Headphones",
  description: "High-quality noise-cancelling headphones",
  source: "SHOPIFY",
  seller: "AudioTech",
  vendor: "AudioTech Inc.",
  merchant_id: 100,
  available: true,
  visible: true,
  min_price: 9999,
  max_price: 14999,
  currency: "USD",
  status: "AVAILABLE",
  tags: ["electronics", "headphones", "wireless"],
  external_url: "https://audiotech.example.com/headphones",
  skus: [{ id: 1 }],
  albums: [{ id: 1 }],
  date_last_modified: "2026-03-13T10:00:00Z",
};

const validSyncPayload = {
  id: 500,
  merchant_id: 100,
  status: "COMPLETED",
  total_products: 250,
  total_products_synced: 248,
};

// ─── webhookEventTypeSchema ─────────────────────────────────────────

describe("webhookEventTypeSchema", () => {
  it("accepts all valid offer event types", () => {
    for (const type of ["OFFER_ADDED", "OFFER_UPDATED", "OFFER_REMOVED", "OFFER_DELETED"]) {
      expect(webhookEventTypeSchema.safeParse(type).success).toBe(true);
    }
  });

  it("accepts all valid sync event types", () => {
    for (const type of ["PRODUCT_SYNC_STARTED", "PRODUCT_SYNC_COMPLETED", "PRODUCT_SYNC_FAILED"]) {
      expect(webhookEventTypeSchema.safeParse(type).success).toBe(true);
    }
  });

  it("accepts ORDER_* event types (Story 5.2)", () => {
    for (const type of [
      "ORDER_UPDATED",
      "ORDER_COMPLETED",
      "ORDER_CANCELED",
      "ORDER_REFUNDED",
      "ORDER_RETURNED",
    ]) {
      expect(webhookEventTypeSchema.safeParse(type).success).toBe(true);
    }
  });

  it("accepts BAG_* event types (Story 5.2)", () => {
    for (const type of [
      "BAG_SUBMITTED",
      "BAG_ACCEPTED",
      "BAG_SHIPPED",
      "BAG_COMPLETED",
      "BAG_CANCELED",
      "BAG_REFUNDED",
    ]) {
      expect(webhookEventTypeSchema.safeParse(type).success).toBe(true);
    }
  });

  it("rejects unknown event types", () => {
    expect(webhookEventTypeSchema.safeParse("UNKNOWN_EVENT").success).toBe(false);
  });

  it("rejects empty string", () => {
    expect(webhookEventTypeSchema.safeParse("").success).toBe(false);
  });

  it("rejects lowercase event types", () => {
    expect(webhookEventTypeSchema.safeParse("offer_added").success).toBe(false);
  });
});

// ─── violetWebhookHeadersSchema ─────────────────────────────────────

describe("violetWebhookHeadersSchema", () => {
  it("validates complete headers", () => {
    const result = violetWebhookHeadersSchema.safeParse({
      hmac: "abc123base64signature==",
      eventId: "evt-uuid-1234",
      eventType: "OFFER_ADDED",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing hmac", () => {
    const result = violetWebhookHeadersSchema.safeParse({
      hmac: "",
      eventId: "evt-uuid-1234",
      eventType: "OFFER_ADDED",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing eventId", () => {
    const result = violetWebhookHeadersSchema.safeParse({
      hmac: "abc123",
      eventId: "",
      eventType: "OFFER_ADDED",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid eventType", () => {
    const result = violetWebhookHeadersSchema.safeParse({
      hmac: "abc123",
      eventId: "evt-uuid-1234",
      eventType: "INVALID_TYPE",
    });
    expect(result.success).toBe(false);
  });

  it("rejects null headers", () => {
    const result = violetWebhookHeadersSchema.safeParse({
      hmac: null,
      eventId: null,
      eventType: null,
    });
    expect(result.success).toBe(false);
  });
});

// ─── violetRequiredHeadersSchema (H2 fix) ────────────────────────────

describe("violetRequiredHeadersSchema (H2 fix)", () => {
  it("accepts known event types as plain strings", () => {
    const result = violetRequiredHeadersSchema.safeParse({
      hmac: "abc123",
      eventId: "evt-uuid-1234",
      eventType: "OFFER_ADDED",
    });
    expect(result.success).toBe(true);
  });

  it("accepts UNKNOWN event types as plain strings (key difference from strict schema)", () => {
    const result = violetRequiredHeadersSchema.safeParse({
      hmac: "abc123",
      eventId: "evt-uuid-1234",
      eventType: "ORDER_UPDATED",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty eventType", () => {
    const result = violetRequiredHeadersSchema.safeParse({
      hmac: "abc123",
      eventId: "evt-uuid-1234",
      eventType: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing hmac", () => {
    const result = violetRequiredHeadersSchema.safeParse({
      hmac: "",
      eventId: "evt-uuid-1234",
      eventType: "OFFER_ADDED",
    });
    expect(result.success).toBe(false);
  });
});

// ─── violetOfferWebhookPayloadSchema ────────────────────────────────

describe("violetOfferWebhookPayloadSchema", () => {
  it("validates a complete offer payload", () => {
    const result = violetOfferWebhookPayloadSchema.safeParse(validOfferPayload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe(12345);
      expect(result.data.name).toBe("Premium Wireless Headphones");
      expect(result.data.currency).toBe("USD");
    }
  });

  it("validates minimal offer payload (only required fields)", () => {
    const result = violetOfferWebhookPayloadSchema.safeParse({
      id: 1,
      name: "Product",
      source: "SHOPIFY",
      merchant_id: 10,
      available: true,
      visible: true,
      status: "AVAILABLE",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      // currency defaults to "USD"
      expect(result.data.currency).toBe("USD");
    }
  });

  it("defaults currency to USD when not provided", () => {
    const { currency: _, ...withoutCurrency } = validOfferPayload;
    const result = violetOfferWebhookPayloadSchema.safeParse(withoutCurrency);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.currency).toBe("USD");
    }
  });

  it("rejects missing required field: id", () => {
    const { id: _, ...withoutId } = validOfferPayload;
    expect(violetOfferWebhookPayloadSchema.safeParse(withoutId).success).toBe(false);
  });

  it("rejects missing required field: name", () => {
    const { name: _, ...withoutName } = validOfferPayload;
    expect(violetOfferWebhookPayloadSchema.safeParse(withoutName).success).toBe(false);
  });

  it("rejects missing required field: available", () => {
    const { available: _, ...withoutAvailable } = validOfferPayload;
    expect(violetOfferWebhookPayloadSchema.safeParse(withoutAvailable).success).toBe(false);
  });

  it("accepts any string status value (I3 fix: z.string, not z.enum)", () => {
    expect(
      violetOfferWebhookPayloadSchema.safeParse({ ...validOfferPayload, status: "INVALID" })
        .success,
    ).toBe(true);
  });

  it("accepts all valid status values (L1 fix: includes DISABLED)", () => {
    for (const status of [
      "UNAVAILABLE",
      "AVAILABLE",
      "DISABLED",
      "DISABLED_UNAVAILABLE",
      "DISABLED_AVAILABLE",
      "FOR_DELETION",
      "ARCHIVED",
    ]) {
      expect(
        violetOfferWebhookPayloadSchema.safeParse({ ...validOfferPayload, status }).success,
      ).toBe(true);
    }
  });

  it("rejects string id (must be number)", () => {
    expect(
      violetOfferWebhookPayloadSchema.safeParse({ ...validOfferPayload, id: "12345" }).success,
    ).toBe(false);
  });

  it("rejects non-boolean available", () => {
    expect(
      violetOfferWebhookPayloadSchema.safeParse({ ...validOfferPayload, available: "true" })
        .success,
    ).toBe(false);
  });

  it("strips unknown fields (Zod default behavior)", () => {
    const result = violetOfferWebhookPayloadSchema.safeParse({
      ...validOfferPayload,
      unknown_field: "should be stripped",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect("unknown_field" in result.data).toBe(false);
    }
  });
});

// ─── violetSyncWebhookPayloadSchema ─────────────────────────────────

describe("violetSyncWebhookPayloadSchema", () => {
  it("validates a complete sync payload", () => {
    const result = violetSyncWebhookPayloadSchema.safeParse(validSyncPayload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe("COMPLETED");
      expect(result.data.total_products_synced).toBe(248);
    }
  });

  it("validates sync payload without optional total_products_synced", () => {
    const { total_products_synced: _, ...withoutSynced } = validSyncPayload;
    const result = violetSyncWebhookPayloadSchema.safeParse(withoutSynced);
    expect(result.success).toBe(true);
  });

  it("accepts all valid sync status values", () => {
    for (const status of [
      "NOT_STARTED",
      "PENDING",
      "IN_PROGRESS",
      "COMPLETED",
      "FAILED",
      "ABORTED",
    ]) {
      expect(
        violetSyncWebhookPayloadSchema.safeParse({ ...validSyncPayload, status }).success,
      ).toBe(true);
    }
  });

  it("rejects invalid sync status", () => {
    expect(
      violetSyncWebhookPayloadSchema.safeParse({ ...validSyncPayload, status: "RUNNING" }).success,
    ).toBe(false);
  });

  it("rejects missing merchant_id", () => {
    const { merchant_id: _, ...withoutMerchant } = validSyncPayload;
    expect(violetSyncWebhookPayloadSchema.safeParse(withoutMerchant).success).toBe(false);
  });

  it("rejects string total_products (must be number)", () => {
    expect(
      violetSyncWebhookPayloadSchema.safeParse({ ...validSyncPayload, total_products: "250" })
        .success,
    ).toBe(false);
  });
});
