/**
 * Tests for notification preferences (Story 6.7).
 *
 * Tests pure functions: query keys, default preferences, type mappings,
 * preference merging. Follows the established pattern from Story 6.5/6.6
 * of testing pure functions (not hooks) due to monorepo renderHook issues.
 */

import { describe, it, expect } from "vitest";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  PUSH_TYPE_TO_PREFERENCE,
  mergeWithDefaults,
  queryKeys,
} from "@ecommerce/shared";

describe("Notification Preferences — Query Keys", () => {
  it("returns correct key for preferences", () => {
    const key = queryKeys.notifications.preferences("user-123");
    expect(key).toEqual(["notifications", "preferences", "user-123"]);
  });

  it("produces unique keys for different users", () => {
    const key1 = queryKeys.notifications.preferences("user-a");
    const key2 = queryKeys.notifications.preferences("user-b");
    expect(key1).not.toEqual(key2);
  });
});

describe("Notification Preferences — Defaults", () => {
  it("has correct default values", () => {
    expect(DEFAULT_NOTIFICATION_PREFERENCES).toEqual({
      order_updates: true,
      price_drops: true,
      back_in_stock: true,
      marketing: false,
    });
  });

  it("transactional types default to true", () => {
    expect(DEFAULT_NOTIFICATION_PREFERENCES.order_updates).toBe(true);
    expect(DEFAULT_NOTIFICATION_PREFERENCES.price_drops).toBe(true);
    expect(DEFAULT_NOTIFICATION_PREFERENCES.back_in_stock).toBe(true);
  });

  it("marketing defaults to false", () => {
    expect(DEFAULT_NOTIFICATION_PREFERENCES.marketing).toBe(false);
  });
});

describe("Notification Preferences — Push Type Mapping", () => {
  it("maps order events to order_updates category", () => {
    expect(PUSH_TYPE_TO_PREFERENCE.order_confirmed).toBe("order_updates");
    expect(PUSH_TYPE_TO_PREFERENCE.order_shipped).toBe("order_updates");
    expect(PUSH_TYPE_TO_PREFERENCE.order_delivered).toBe("order_updates");
    expect(PUSH_TYPE_TO_PREFERENCE.refund_processed).toBe("order_updates");
  });

  it("maps price_drop to price_drops category", () => {
    expect(PUSH_TYPE_TO_PREFERENCE.price_drop).toBe("price_drops");
  });

  it("maps back_in_stock to back_in_stock category", () => {
    expect(PUSH_TYPE_TO_PREFERENCE.back_in_stock).toBe("back_in_stock");
  });

  it("covers all push types", () => {
    const pushTypes = [
      "order_confirmed",
      "order_shipped",
      "order_delivered",
      "refund_processed",
      "price_drop",
      "back_in_stock",
    ] as const;
    for (const type of pushTypes) {
      expect(PUSH_TYPE_TO_PREFERENCE[type]).toBeDefined();
    }
  });
});

describe("Notification Preferences — mergeWithDefaults", () => {
  it("returns all defaults when DB has no preferences", () => {
    const result = mergeWithDefaults([]);
    expect(result).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
  });

  it("overrides defaults with DB values", () => {
    const result = mergeWithDefaults([
      { notification_type: "order_updates", enabled: false },
      { notification_type: "marketing", enabled: true },
    ]);
    expect(result.order_updates).toBe(false);
    expect(result.marketing).toBe(true);
    // Unset types keep defaults
    expect(result.price_drops).toBe(true);
    expect(result.back_in_stock).toBe(true);
  });

  it("handles single preference override", () => {
    const result = mergeWithDefaults([{ notification_type: "price_drops", enabled: false }]);
    expect(result.price_drops).toBe(false);
    expect(result.order_updates).toBe(true);
    expect(result.back_in_stock).toBe(true);
    expect(result.marketing).toBe(false);
  });

  it("handles all preferences set explicitly", () => {
    const result = mergeWithDefaults([
      { notification_type: "order_updates", enabled: false },
      { notification_type: "price_drops", enabled: false },
      { notification_type: "back_in_stock", enabled: false },
      { notification_type: "marketing", enabled: true },
    ]);
    expect(result).toEqual({
      order_updates: false,
      price_drops: false,
      back_in_stock: false,
      marketing: true,
    });
  });
});
