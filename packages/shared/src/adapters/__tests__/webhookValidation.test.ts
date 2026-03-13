import { describe, it, expect, vi } from "vitest";
import { VioletAdapter } from "../violetAdapter.js";
import type { VioletTokenManager } from "../../clients/violetAuth.js";

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

/**
 * Creates a Headers object simulating Violet webhook headers.
 * Uses lowercase keys — HTTP headers are case-insensitive per RFC 7230,
 * and the Fetch API's Headers class normalizes to lowercase.
 */
function createWebhookHeaders(
  overrides: Partial<{ hmac: string; eventId: string; topic: string }> = {},
): Headers {
  const headers = new Headers();
  if (overrides.hmac !== undefined) {
    headers.set("x-violet-hmac", overrides.hmac);
  } else {
    headers.set("x-violet-hmac", "validbase64hmac==");
  }
  if (overrides.eventId !== undefined) {
    headers.set("x-violet-event-id", overrides.eventId);
  } else {
    headers.set("x-violet-event-id", "evt-test-123");
  }
  if (overrides.topic !== undefined) {
    headers.set("x-violet-topic", overrides.topic);
  } else {
    headers.set("x-violet-topic", "OFFER_ADDED");
  }
  return headers;
}

// ─── VioletAdapter.validateWebhook() ────────────────────────────────

describe("VioletAdapter.validateWebhook", () => {
  const adapter = new VioletAdapter(createMockTokenManager());

  it("returns true when all required headers are present", () => {
    const headers = createWebhookHeaders();
    expect(adapter.validateWebhook(headers, '{"id":1}')).toBe(true);
  });

  it("returns false when x-violet-hmac is missing", () => {
    const headers = new Headers();
    headers.set("x-violet-event-id", "evt-123");
    headers.set("x-violet-topic", "OFFER_ADDED");
    expect(adapter.validateWebhook(headers, '{"id":1}')).toBe(false);
  });

  it("returns false when x-violet-event-id is missing", () => {
    const headers = new Headers();
    headers.set("x-violet-hmac", "abc123");
    headers.set("x-violet-topic", "OFFER_ADDED");
    expect(adapter.validateWebhook(headers, '{"id":1}')).toBe(false);
  });

  it("returns false when x-violet-topic is missing", () => {
    const headers = new Headers();
    headers.set("x-violet-hmac", "abc123");
    headers.set("x-violet-event-id", "evt-123");
    expect(adapter.validateWebhook(headers, '{"id":1}')).toBe(false);
  });

  it("returns false when all headers are missing", () => {
    const headers = new Headers();
    expect(adapter.validateWebhook(headers, '{"id":1}')).toBe(false);
  });

  it("returns true regardless of body content (body validation is async)", () => {
    const headers = createWebhookHeaders();
    expect(adapter.validateWebhook(headers, "")).toBe(true);
    expect(adapter.validateWebhook(headers, "not-json")).toBe(true);
  });
});

// ─── VioletAdapter.processWebhook() ─────────────────────────────────

describe("VioletAdapter.processWebhook", () => {
  const adapter = new VioletAdapter(createMockTokenManager());

  it("returns success for any webhook event (delegates to Edge Function)", async () => {
    const result = await adapter.processWebhook({
      id: "evt-123",
      type: "OFFER_ADDED",
      entityId: "12345",
      data: { id: 12345, name: "Test" },
      createdAt: new Date().toISOString(),
    });

    expect(result.error).toBeNull();
  });

  it("returns success for sync events (monitoring only)", async () => {
    const result = await adapter.processWebhook({
      id: "evt-456",
      type: "PRODUCT_SYNC_COMPLETED",
      entityId: "sync-789",
      data: { id: 500, merchant_id: 100, status: "COMPLETED", total_products: 250 },
      createdAt: new Date().toISOString(),
    });

    expect(result.error).toBeNull();
  });
});
