import { describe, it, expect, beforeEach, vi } from "vitest";
import { queryKeys, recentlyViewedQueryOptions } from "@ecommerce/shared";
import { getRecentlyViewedFromStorage, addToRecentlyViewedStorage } from "@ecommerce/shared";

// ─── Mock localStorage ──────────────────────────────────────────────

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
  };
})();

Object.defineProperty(globalThis, "localStorage", { value: localStorageMock });

beforeEach(() => {
  localStorageMock.clear();
  vi.clearAllMocks();
});

// ─── Query Key Tests ────────────────────────────────────────────────

describe("queryKeys.recentlyViewed", () => {
  it("forUser() returns correct key structure", () => {
    const key = queryKeys.recentlyViewed.forUser("user-abc");
    expect(key).toEqual(["recentlyViewed", "user-abc"]);
  });

  it("anonymous() returns correct key structure", () => {
    const key = queryKeys.recentlyViewed.anonymous();
    expect(key).toEqual(["recentlyViewed", "anonymous"]);
  });

  it("forUser() returns different keys for different users", () => {
    const key1 = queryKeys.recentlyViewed.forUser("user-A");
    const key2 = queryKeys.recentlyViewed.forUser("user-B");
    expect(key1).not.toEqual(key2);
  });

  it("forUser() and anonymous() return different keys", () => {
    const userKey = queryKeys.recentlyViewed.forUser("user-A");
    const anonKey = queryKeys.recentlyViewed.anonymous();
    expect(userKey).not.toEqual(anonKey);
  });
});

// ─── localStorage Helper Tests ──────────────────────────────────────

describe("getRecentlyViewedFromStorage", () => {
  it("returns empty array when localStorage is empty", () => {
    const result = getRecentlyViewedFromStorage();
    expect(result).toEqual([]);
  });

  it("returns parsed entries from localStorage", () => {
    const entries = [
      { productId: "prod-1", viewedAt: "2026-03-17T10:00:00.000Z" },
      { productId: "prod-2", viewedAt: "2026-03-17T09:00:00.000Z" },
    ];
    localStorageMock.setItem("recently-viewed", JSON.stringify(entries));

    const result = getRecentlyViewedFromStorage();
    expect(result).toEqual(entries);
  });

  it("returns empty array on invalid JSON", () => {
    localStorageMock.setItem("recently-viewed", "not-valid-json{{{");

    const result = getRecentlyViewedFromStorage();
    expect(result).toEqual([]);
  });
});

describe("addToRecentlyViewedStorage", () => {
  it("adds a new entry to empty storage", () => {
    addToRecentlyViewedStorage("prod-1");

    const stored = JSON.parse(localStorageMock.getItem("recently-viewed")!);
    expect(stored).toHaveLength(1);
    expect(stored[0].productId).toBe("prod-1");
    expect(stored[0].viewedAt).toBeDefined();
  });

  it("prepends new entry to existing list", () => {
    const existing = [{ productId: "prod-old", viewedAt: "2026-03-17T09:00:00.000Z" }];
    localStorageMock.setItem("recently-viewed", JSON.stringify(existing));

    addToRecentlyViewedStorage("prod-new");

    const stored = JSON.parse(localStorageMock.getItem("recently-viewed")!);
    expect(stored).toHaveLength(2);
    expect(stored[0].productId).toBe("prod-new");
    expect(stored[1].productId).toBe("prod-old");
  });

  it("deduplicates — moves re-viewed product to front", () => {
    const existing = [
      { productId: "prod-1", viewedAt: "2026-03-17T10:00:00.000Z" },
      { productId: "prod-2", viewedAt: "2026-03-17T09:00:00.000Z" },
      { productId: "prod-3", viewedAt: "2026-03-17T08:00:00.000Z" },
    ];
    localStorageMock.setItem("recently-viewed", JSON.stringify(existing));

    addToRecentlyViewedStorage("prod-3");

    const stored = JSON.parse(localStorageMock.getItem("recently-viewed")!);
    expect(stored).toHaveLength(3);
    expect(stored[0].productId).toBe("prod-3"); // moved to front
    expect(stored[1].productId).toBe("prod-1");
    expect(stored[2].productId).toBe("prod-2");
  });

  it("trims to maximum 12 entries", () => {
    const existing = Array.from({ length: 12 }, (_, i) => ({
      productId: `prod-${i}`,
      viewedAt: new Date(2026, 2, 17, 10 - i).toISOString(),
    }));
    localStorageMock.setItem("recently-viewed", JSON.stringify(existing));

    addToRecentlyViewedStorage("prod-new");

    const stored = JSON.parse(localStorageMock.getItem("recently-viewed")!);
    expect(stored).toHaveLength(12);
    expect(stored[0].productId).toBe("prod-new");
    // prod-11 (the oldest) should have been evicted
    expect(stored.find((e: { productId: string }) => e.productId === "prod-11")).toBeUndefined();
  });

  it("handles corrupted localStorage gracefully", () => {
    localStorageMock.setItem("recently-viewed", "corrupted{{{");

    // Should not throw
    expect(() => addToRecentlyViewedStorage("prod-1")).not.toThrow();

    // Should have started fresh
    const stored = JSON.parse(localStorageMock.getItem("recently-viewed")!);
    expect(stored).toHaveLength(1);
    expect(stored[0].productId).toBe("prod-1");
  });
});

// ─── recentlyViewedQueryOptions Tests (L3 code-review fix) ─────────
// Covers the anonymous path: verifies that the query function actually
// reads from localStorage and returns product IDs in the right order.
// The authenticated path requires mocking getUserEvents (Supabase client)
// which is out of scope for these pure-function unit tests.

describe("recentlyViewedQueryOptions (anonymous path)", () => {
  it("returns product IDs from localStorage in order", async () => {
    const entries = [
      { productId: "prod-A", viewedAt: "2026-03-17T10:00:00.000Z" },
      { productId: "prod-B", viewedAt: "2026-03-17T09:00:00.000Z" },
      { productId: "prod-C", viewedAt: "2026-03-17T08:00:00.000Z" },
    ];
    localStorageMock.setItem("recently-viewed", JSON.stringify(entries));

    const options = recentlyViewedQueryOptions({});
    const result = await options.queryFn!({} as never);
    expect(result).toEqual(["prod-A", "prod-B", "prod-C"]);
  });

  it("respects limit parameter", async () => {
    const entries = Array.from({ length: 10 }, (_, i) => ({
      productId: `prod-${i}`,
      viewedAt: new Date(2026, 2, 17, 10 - i).toISOString(),
    }));
    localStorageMock.setItem("recently-viewed", JSON.stringify(entries));

    const options = recentlyViewedQueryOptions({ limit: 3 });
    const result = await options.queryFn!({} as never);
    expect(result).toHaveLength(3);
    expect(result).toEqual(["prod-0", "prod-1", "prod-2"]);
  });

  it("returns empty array when localStorage is empty", async () => {
    const options = recentlyViewedQueryOptions({});
    const result = await options.queryFn!({} as never);
    expect(result).toEqual([]);
  });

  it("uses anonymous query key when no userId", () => {
    const options = recentlyViewedQueryOptions({});
    expect(options.queryKey).toEqual(["recentlyViewed", "anonymous"]);
  });

  it("uses user-specific query key when userId provided", () => {
    const options = recentlyViewedQueryOptions({ userId: "user-123" });
    expect(options.queryKey).toEqual(["recentlyViewed", "user-123"]);
  });

  it("has enabled: true for all users", () => {
    const anonOptions = recentlyViewedQueryOptions({});
    const authOptions = recentlyViewedQueryOptions({ userId: "user-123" });
    expect(anonOptions.enabled).toBe(true);
    expect(authOptions.enabled).toBe(true);
  });
});
