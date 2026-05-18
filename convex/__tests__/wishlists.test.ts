/**
 * Convex tests for wishlist queries and mutations.
 *
 * Tests: getWishlist, getWishlistProductIds, addToWishlist, removeFromWishlist
 * Covers: auto-creation, idempotency, dedup, graceful no-op on remove.
 *
 * @module convex/__tests__/wishlists.test
 */
import { describe, it, expect } from "vitest";
import { convexTest, TEST_USER as _TEST_USER, seedWishlist } from "./helpers";
import { api } from "../_generated/api";

describe("wishlists", () => {
  // ─── getWishlist ───────────────────────────────────────────────────

  describe("getWishlist", () => {
    it("returns null when no wishlist exists", async () => {
      const t = convexTest();

      const wishlist = await t.query(api.wishlists.queries.getWishlist, {
        userId: "new-user",
      });

      expect(wishlist).toBeNull();
    });

    it("returns wishlist with items", async () => {
      const t = convexTest();

      await seedWishlist(t, "user-A", ["prod-1", "prod-2"]);

      const wishlist = await t.query(api.wishlists.queries.getWishlist, {
        userId: "user-A",
      });

      expect(wishlist).not.toBeNull();
      expect(wishlist!.items).toHaveLength(2);
      const productIds = wishlist!.items.map((i) => i.productId).sort();
      expect(productIds).toEqual(["prod-1", "prod-2"]);
    });

    it("returns empty items for wishlist with no products", async () => {
      const t = convexTest();

      await seedWishlist(t, "user-A", []);

      const wishlist = await t.query(api.wishlists.queries.getWishlist, {
        userId: "user-A",
      });

      expect(wishlist).not.toBeNull();
      expect(wishlist!.items).toEqual([]);
    });
  });

  // ─── getWishlistProductIds ─────────────────────────────────────────

  describe("getWishlistProductIds", () => {
    it("returns empty array when no wishlist exists", async () => {
      const t = convexTest();

      const ids = await t.query(api.wishlists.queries.getWishlistProductIds, {
        userId: "new-user",
      });

      expect(ids).toEqual([]);
    });

    it("returns product IDs for existing wishlist", async () => {
      const t = convexTest();

      await seedWishlist(t, "user-A", ["prod-1", "prod-2", "prod-3"]);

      const ids = await t.query(api.wishlists.queries.getWishlistProductIds, {
        userId: "user-A",
      });

      expect(ids.sort()).toEqual(["prod-1", "prod-2", "prod-3"]);
    });
  });

  // ─── addToWishlist ────────────────────────────────────────────────

  describe("addToWishlist", () => {
    it("creates wishlist and adds first product", async () => {
      const t = convexTest();

      await t.mutation(api.wishlists.mutations.addToWishlist, {
        userId: "user-A",
        productId: "prod-1",
      });

      const wishlist = await t.query(api.wishlists.queries.getWishlist, {
        userId: "user-A",
      });

      expect(wishlist).not.toBeNull();
      expect(wishlist!.items).toHaveLength(1);
      expect(wishlist!.items[0].productId).toBe("prod-1");
    });

    it("is idempotent — adding same product twice is a no-op", async () => {
      const t = convexTest();

      await t.mutation(api.wishlists.mutations.addToWishlist, {
        userId: "user-A",
        productId: "prod-1",
      });
      await t.mutation(api.wishlists.mutations.addToWishlist, {
        userId: "user-A",
        productId: "prod-1",
      });

      const ids = await t.query(api.wishlists.queries.getWishlistProductIds, {
        userId: "user-A",
      });

      expect(ids).toEqual(["prod-1"]); // Not duplicated
    });

    it("adds different products to the same wishlist", async () => {
      const t = convexTest();

      await t.mutation(api.wishlists.mutations.addToWishlist, {
        userId: "user-A",
        productId: "prod-1",
      });
      await t.mutation(api.wishlists.mutations.addToWishlist, {
        userId: "user-A",
        productId: "prod-2",
      });

      const ids = await t.query(api.wishlists.queries.getWishlistProductIds, {
        userId: "user-A",
      });

      expect(ids.sort()).toEqual(["prod-1", "prod-2"]);
    });
  });

  // ─── removeFromWishlist ───────────────────────────────────────────

  describe("removeFromWishlist", () => {
    it("removes a product from the wishlist", async () => {
      const t = convexTest();

      await seedWishlist(t, "user-A", ["prod-1", "prod-2"]);

      await t.mutation(api.wishlists.mutations.removeFromWishlist, {
        userId: "user-A",
        productId: "prod-1",
      });

      const ids = await t.query(api.wishlists.queries.getWishlistProductIds, {
        userId: "user-A",
      });

      expect(ids).toEqual(["prod-2"]);
    });

    it("is a no-op when product is not in wishlist", async () => {
      const t = convexTest();

      await seedWishlist(t, "user-A", ["prod-1"]);

      await t.mutation(api.wishlists.mutations.removeFromWishlist, {
        userId: "user-A",
        productId: "prod-999",
      });

      const ids = await t.query(api.wishlists.queries.getWishlistProductIds, {
        userId: "user-A",
      });

      expect(ids).toEqual(["prod-1"]); // Unchanged
    });

    it("is a no-op when no wishlist exists", async () => {
      const t = convexTest();

      // Should not throw
      await t.mutation(api.wishlists.mutations.removeFromWishlist, {
        userId: "user-without-wishlist",
        productId: "prod-1",
      });
    });

    it("can remove all items leaving empty wishlist", async () => {
      const t = convexTest();

      await seedWishlist(t, "user-A", ["prod-1"]);

      await t.mutation(api.wishlists.mutations.removeFromWishlist, {
        userId: "user-A",
        productId: "prod-1",
      });

      const wishlist = await t.query(api.wishlists.queries.getWishlist, {
        userId: "user-A",
      });

      // Wishlist still exists but empty
      expect(wishlist).not.toBeNull();
      expect(wishlist!.items).toEqual([]);
    });
  });
});
