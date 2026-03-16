/**
 * Tests for the tracking dedup logic.
 *
 * M2 code-review fix: `getDedupKey` is now imported from the source module
 * instead of being duplicated. Previously, the test copied the function,
 * meaning changes to the real implementation would not be caught by tests.
 *
 * React hook integration with renderHook is not possible because
 * `@ecommerce/shared` resolves to a different React copy in the monorepo.
 * Instead, we test `getDedupKey` (exported) and simulate the dedup window
 * behavior with a standalone Map — the same data structure the hook uses.
 */
import { describe, it, expect } from "vitest";
import { getDedupKey } from "@ecommerce/shared";
import type { TrackingEvent } from "@ecommerce/shared";

describe("tracking dedup logic", () => {
  it("generates unique keys for different product_ids", () => {
    const key1 = getDedupKey({ event_type: "product_view", payload: { product_id: "p1" } });
    const key2 = getDedupKey({ event_type: "product_view", payload: { product_id: "p2" } });

    expect(key1).toBe("product_view:p1");
    expect(key2).toBe("product_view:p2");
    expect(key1).not.toBe(key2);
  });

  it("generates same key for same product_id", () => {
    const key1 = getDedupKey({ event_type: "product_view", payload: { product_id: "p1" } });
    const key2 = getDedupKey({ event_type: "product_view", payload: { product_id: "p1" } });

    expect(key1).toBe(key2);
  });

  it("generates unique keys for different search queries", () => {
    const key1 = getDedupKey({
      event_type: "search",
      payload: { query: "shoes", result_count: 5 },
    });
    const key2 = getDedupKey({
      event_type: "search",
      payload: { query: "bags", result_count: 3 },
    });

    expect(key1).toBe("search:shoes");
    expect(key2).toBe("search:bags");
    expect(key1).not.toBe(key2);
  });

  it("generates same key for same search query regardless of result_count", () => {
    const key1 = getDedupKey({
      event_type: "search",
      payload: { query: "shoes", result_count: 5 },
    });
    const key2 = getDedupKey({
      event_type: "search",
      payload: { query: "shoes", result_count: 10 },
    });

    expect(key1).toBe(key2);
  });

  it("generates unique keys for different category_ids", () => {
    const key1 = getDedupKey({
      event_type: "category_view",
      payload: { category_id: "home", category_name: "Home" },
    });
    const key2 = getDedupKey({
      event_type: "category_view",
      payload: { category_id: "fashion", category_name: "Fashion" },
    });

    expect(key1).not.toBe(key2);
  });

  it("generates different keys for different event types with same id", () => {
    const productKey = getDedupKey({
      event_type: "product_view",
      payload: { product_id: "home" },
    });
    const categoryKey = getDedupKey({
      event_type: "category_view",
      payload: { category_id: "home", category_name: "Home" },
    });

    expect(productKey).not.toBe(categoryKey);
  });
});

describe("tracking dedup window simulation", () => {
  it("deduplicates within 60s window using Map-based tracking", () => {
    const recentEvents = new Map<string, number>();
    const DEDUP_WINDOW_MS = 60_000;
    const fired: string[] = [];

    function shouldFire(event: TrackingEvent, now: number): boolean {
      const dedupKey = getDedupKey(event);
      const lastFired = recentEvents.get(dedupKey);
      if (lastFired && now - lastFired < DEDUP_WINDOW_MS) return false;
      recentEvents.set(dedupKey, now);
      fired.push(dedupKey);
      return true;
    }

    const event: TrackingEvent = {
      event_type: "product_view",
      payload: { product_id: "p1" },
    };

    // First call fires
    expect(shouldFire(event, 1000)).toBe(true);
    // Same event within 60s is deduped
    expect(shouldFire(event, 2000)).toBe(false);
    // Same event after 60s fires again
    expect(shouldFire(event, 62_000)).toBe(true);

    expect(fired).toEqual(["product_view:p1", "product_view:p1"]);
  });

  it("allows different events to fire independently", () => {
    const recentEvents = new Map<string, number>();
    const DEDUP_WINDOW_MS = 60_000;

    function shouldFire(event: TrackingEvent, now: number): boolean {
      const dedupKey = getDedupKey(event);
      const lastFired = recentEvents.get(dedupKey);
      if (lastFired && now - lastFired < DEDUP_WINDOW_MS) return false;
      recentEvents.set(dedupKey, now);
      return true;
    }

    const t = 1000;
    expect(shouldFire({ event_type: "product_view", payload: { product_id: "p1" } }, t)).toBe(true);
    expect(shouldFire({ event_type: "product_view", payload: { product_id: "p2" } }, t)).toBe(true);
    expect(
      shouldFire({ event_type: "search", payload: { query: "shoes", result_count: 5 } }, t),
    ).toBe(true);
  });
});
