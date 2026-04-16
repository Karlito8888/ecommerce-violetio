/**
 * Tests for Violet Merchant adapter — commission rate management.
 *
 * Covers:
 * 1. setCommissionRate — API call, field mapping, error handling
 * 2. AppInstall type mapping
 *
 * @see packages/shared/src/adapters/violetMerchants.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { VioletTokenManager } from "../../clients/violetAuth.js";
import type { AppInstall } from "../../types/admin.types.js";

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

function createMockAppInstall(overrides: Record<string, unknown> = {}) {
  return {
    id: 1001,
    app_id: 100,
    merchant_id: 12345,
    scope: "CHANNEL",
    status: "ACTIVE",
    install_source: "DIRECT",
    commission_rate: 12.5,
    commission_locked: true,
    date_created: "2026-01-15T10:00:00Z",
    date_last_modified: "2026-04-16T14:00:00Z",
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────

describe("violetMerchants adapter", () => {
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

  describe("setCommissionRate", () => {
    it("calls PUT /apps/{app_id}/merchants/{merchant_id}/commission_rate", async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(createMockAppInstall()),
      });

      const { setCommissionRate } = await import("../violetMerchants.js");
      const result = await setCommissionRate(ctx, "100", {
        merchantId: "12345",
        commissionRate: 12.5,
        commissionLocked: true,
      });

      expect(result.error).toBeNull();
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      const [url, options] = fetchSpy.mock.calls[0];
      expect(url).toBe("https://sandbox-api.violet.io/v1/apps/100/merchants/12345/commission_rate");
      expect(options.method).toBe("PUT");
      expect(options.headers["Content-Type"]).toBe("application/json");
    });

    it("sends commission_rate and commission_locked in body", async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(createMockAppInstall()),
      });

      const { setCommissionRate } = await import("../violetMerchants.js");
      await setCommissionRate(ctx, "100", {
        merchantId: "12345",
        commissionRate: 15,
        commissionLocked: false,
      });

      const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
      expect(body.commission_rate).toBe(15);
      expect(body.commission_locked).toBe(false);
    });

    it("maps AppInstall response to camelCase fields", async () => {
      const rawInstall = createMockAppInstall();
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(rawInstall),
      });

      const { setCommissionRate } = await import("../violetMerchants.js");
      const result = await setCommissionRate(ctx, "100", {
        merchantId: "12345",
        commissionRate: 12.5,
        commissionLocked: true,
      });

      expect(result.error).toBeNull();
      const install: AppInstall = result.data!;
      expect(install.id).toBe("1001");
      expect(install.appId).toBe("100");
      expect(install.merchantId).toBe("12345");
      expect(install.scope).toBe("CHANNEL");
      expect(install.status).toBe("ACTIVE");
      expect(install.installSource).toBe("DIRECT");
      expect(install.commissionRate).toBe(12.5);
      expect(install.commissionLocked).toBe(true);
      expect(install.dateCreated).toBe("2026-01-15T10:00:00Z");
      expect(install.dateLastModified).toBe("2026-04-16T14:00:00Z");
    });

    it("handles response with missing optional fields gracefully", async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 500 }),
      });

      const { setCommissionRate } = await import("../violetMerchants.js");
      const result = await setCommissionRate(ctx, "100", {
        merchantId: "12345",
        commissionRate: 10,
        commissionLocked: false,
      });

      const install = result.data!;
      expect(install.id).toBe("500");
      expect(install.appId).toBe("");
      expect(install.merchantId).toBe("");
      expect(install.scope).toBe("");
      expect(install.status).toBe("");
      expect(install.commissionRate).toBe(0);
      expect(install.commissionLocked).toBe(false);
    });

    it("returns error on non-2xx response", async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: false,
        status: 403,
        text: () => Promise.resolve("Forbidden — cannot lock commission"),
      });

      const { setCommissionRate } = await import("../violetMerchants.js");
      const result = await setCommissionRate(ctx, "100", {
        merchantId: "12345",
        commissionRate: 12.5,
        commissionLocked: true,
      });

      expect(result.data).toBeNull();
      expect(result.error!.code).toBe("VIOLET.AUTH_FAILED");
    });

    it("returns error on 404 for unknown merchant", async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: () => Promise.resolve("Merchant not found"),
      });

      const { setCommissionRate } = await import("../violetMerchants.js");
      const result = await setCommissionRate(ctx, "100", {
        merchantId: "99999",
        commissionRate: 10,
        commissionLocked: false,
      });

      expect(result.data).toBeNull();
      expect(result.error!.code).toBe("VIOLET.NOT_FOUND");
    });

    it("returns NETWORK_ERROR on fetch failure", async () => {
      fetchSpy.mockRejectedValue(new Error("Connection refused"));

      const { setCommissionRate } = await import("../violetMerchants.js");
      const result = await setCommissionRate(ctx, "100", {
        merchantId: "12345",
        commissionRate: 10,
        commissionLocked: false,
      });

      expect(result.data).toBeNull();
      expect(result.error!.code).toBe("VIOLET.NETWORK_ERROR");
    }, 10000);

    it("validates commission rate is in body even when 0", async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve(createMockAppInstall({ commission_rate: 0, commission_locked: false })),
      });

      const { setCommissionRate } = await import("../violetMerchants.js");
      const result = await setCommissionRate(ctx, "100", {
        merchantId: "12345",
        commissionRate: 0,
        commissionLocked: false,
      });

      const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
      expect(body.commission_rate).toBe(0);
      expect(body.commission_locked).toBe(false);
      expect(result.data!.commissionRate).toBe(0);
    });
  });
});
