/**
 * Convex tests for users queries and mutations.
 *
 * Tests: getProfile, getUserById, getIdentity, getBiometricPreference,
 *        updateProfile, setBiometricPreference, migrateAnonymousData
 *
 * Covers: auth context, admin checks, profile CRUD, anonymous migration.
 *
 * @module convex/__tests__/users.test
 */
import { describe, it, expect } from "vitest";
import {
  convexTest,
  TEST_USER,
  ADMIN_USER,
  seedUserProfile,
  seedWishlist,
  seedTrackingEvent,
} from "./helpers";
import { api } from "../_generated/api";

// ─── Queries ──────────────────────────────────────────────────────────

describe("users queries", () => {
  describe("getIdentity", () => {
    it("returns identity for authenticated user", async () => {
      const t = convexTest();
      const asUser = t.withIdentity(TEST_USER);

      const identity = await asUser.query(api.users.queries.getIdentity);

      expect(identity).toMatchObject({
        subject: TEST_USER.subject,
        name: TEST_USER.name,
        email: TEST_USER.email,
        emailVerified: TEST_USER.emailVerified,
      });
    });

    it("returns null for unauthenticated user", async () => {
      const t = convexTest();

      const identity = await t.query(api.users.queries.getIdentity);

      expect(identity).toBeNull();
    });
  });

  describe("getProfile", () => {
    it("returns profile for authenticated user", async () => {
      const t = convexTest();

      // Seed profile
      await seedUserProfile(t, { userId: TEST_USER.subject, displayName: "Alice" });

      const asUser = t.withIdentity(TEST_USER);
      const profile = await asUser.query(api.users.queries.getProfile);

      expect(profile).not.toBeNull();
      expect(profile!.displayName).toBe("Alice");
      expect(profile!.userId).toBe(TEST_USER.subject);
    });

    it("returns null when no profile exists", async () => {
      const t = convexTest();
      const asUser = t.withIdentity(TEST_USER);

      const profile = await asUser.query(api.users.queries.getProfile);

      expect(profile).toBeNull();
    });

    it("returns null for unauthenticated user", async () => {
      const t = convexTest();

      const profile = await t.query(api.users.queries.getProfile);

      expect(profile).toBeNull();
    });
  });

  describe("getUserById (admin)", () => {
    it("returns profile for a given userId (admin)", async () => {
      const t = convexTest();

      await seedUserProfile(t, {
        userId: ADMIN_USER.subject,
        isAdmin: true,
      });
      await seedUserProfile(t, { userId: "target-user", displayName: "Target" });

      const asAdmin = t.withIdentity(ADMIN_USER);
      const profile = await asAdmin.query(api.users.queries.getUserById, {
        userId: "target-user",
      });

      expect(profile).not.toBeNull();
      expect(profile!.displayName).toBe("Target");
    });

    it("throws if caller is not admin", async () => {
      const t = convexTest();

      await seedUserProfile(t, { userId: TEST_USER.subject, isAdmin: false });

      const asUser = t.withIdentity(TEST_USER);
      await expect(
        asUser.query(api.users.queries.getUserById, { userId: "target-user" }),
      ).rejects.toThrow("Admin access required");
    });
  });

  describe("getBiometricPreference", () => {
    it("returns true when biometricEnabled is set", async () => {
      const t = convexTest();

      await seedUserProfile(t, {
        userId: TEST_USER.subject,
        biometricEnabled: true,
      });

      const asUser = t.withIdentity(TEST_USER);
      const enabled = await asUser.query(api.users.queries.getBiometricPreference);

      expect(enabled).toBe(true);
    });

    it("returns false when biometricEnabled is not set", async () => {
      const t = convexTest();

      await seedUserProfile(t, {
        userId: TEST_USER.subject,
        biometricEnabled: false,
      });

      const asUser = t.withIdentity(TEST_USER);
      const enabled = await asUser.query(api.users.queries.getBiometricPreference);

      expect(enabled).toBe(false);
    });

    it("returns false for unauthenticated user", async () => {
      const t = convexTest();

      const enabled = await t.query(api.users.queries.getBiometricPreference);

      expect(enabled).toBe(false);
    });
  });
});

// ─── Mutations ────────────────────────────────────────────────────────

describe("users mutations", () => {
  describe("updateProfile", () => {
    it("updates display name", async () => {
      const t = convexTest();

      await seedUserProfile(t, { userId: TEST_USER.subject, displayName: "Old Name" });

      const asUser = t.withIdentity(TEST_USER);
      await asUser.mutation(api.users.mutations.updateProfile, {
        displayName: "New Name",
      });

      // Verify
      const profile = await asUser.query(api.users.queries.getProfile);
      expect(profile!.displayName).toBe("New Name");
    });

    it("updates avatar URL", async () => {
      const t = convexTest();

      await seedUserProfile(t, { userId: TEST_USER.subject });

      const asUser = t.withIdentity(TEST_USER);
      await asUser.mutation(api.users.mutations.updateProfile, {
        avatarUrl: "https://example.com/avatar.png",
      });

      const profile = await asUser.query(api.users.queries.getProfile);
      expect(profile!.avatarUrl).toBe("https://example.com/avatar.png");
    });

    it("updates preferences", async () => {
      const t = convexTest();

      await seedUserProfile(t, { userId: TEST_USER.subject });

      const asUser = t.withIdentity(TEST_USER);
      await asUser.mutation(api.users.mutations.updateProfile, {
        preferences: { theme: "dark", language: "fr" },
      });

      const profile = await asUser.query(api.users.queries.getProfile);
      expect(profile!.preferences).toEqual({ theme: "dark", language: "fr" });
    });

    it("throws if not authenticated", async () => {
      const t = convexTest();

      await expect(
        t.mutation(api.users.mutations.updateProfile, { displayName: "Hacker" }),
      ).rejects.toThrow("Not authenticated");
    });

    it("throws if profile not found", async () => {
      const t = convexTest();
      const asUser = t.withIdentity(TEST_USER);

      // No profile seeded
      await expect(
        asUser.mutation(api.users.mutations.updateProfile, { displayName: "Ghost" }),
      ).rejects.toThrow("Profile not found");
    });
  });

  describe("setBiometricPreference", () => {
    it("enables biometric", async () => {
      const t = convexTest();

      await seedUserProfile(t, {
        userId: TEST_USER.subject,
        biometricEnabled: false,
      });

      const asUser = t.withIdentity(TEST_USER);
      await asUser.mutation(api.users.mutations.setBiometricPreference, {
        enabled: true,
      });

      const enabled = await asUser.query(api.users.queries.getBiometricPreference);
      expect(enabled).toBe(true);
    });

    it("disables biometric", async () => {
      const t = convexTest();

      await seedUserProfile(t, {
        userId: TEST_USER.subject,
        biometricEnabled: true,
      });

      const asUser = t.withIdentity(TEST_USER);
      await asUser.mutation(api.users.mutations.setBiometricPreference, {
        enabled: false,
      });

      const enabled = await asUser.query(api.users.queries.getBiometricPreference);
      expect(enabled).toBe(false);
    });

    it("no-ops if no profile exists", async () => {
      const t = convexTest();
      const asUser = t.withIdentity(TEST_USER);

      // Should not throw
      await asUser.mutation(api.users.mutations.setBiometricPreference, {
        enabled: true,
      });
    });

    it("throws if not authenticated", async () => {
      const t = convexTest();

      await expect(
        t.mutation(api.users.mutations.setBiometricPreference, { enabled: true }),
      ).rejects.toThrow("Not authenticated");
    });
  });

  describe("migrateAnonymousData", () => {
    it("migrates wishlist from localId to userId", async () => {
      const t = convexTest();

      const localId = "local-anon-123";
      await seedUserProfile(t, { userId: TEST_USER.subject });
      await seedWishlist(t, localId, ["prod-1", "prod-2"]);

      const asUser = t.withIdentity(TEST_USER);
      const result = await asUser.mutation(api.users.mutations.migrateAnonymousData, {
        localId,
      });

      expect(result.migrated.wishlists).toBe(1);

      // Verify wishlist now belongs to the user
      const wishlist = await t.query(api.wishlists.queries.getWishlist, {
        userId: TEST_USER.subject,
      });
      expect(wishlist).not.toBeNull();
      expect(wishlist!.items).toHaveLength(2);
    });

    it("merges items when user already has a wishlist", async () => {
      const t = convexTest();

      const localId = "local-anon-123";
      await seedUserProfile(t, { userId: TEST_USER.subject });
      // User already has a wishlist with prod-1
      await seedWishlist(t, TEST_USER.subject, ["prod-1"]);
      // Anonymous has prod-2 and prod-1 (duplicate)
      await seedWishlist(t, localId, ["prod-2", "prod-1"]);

      const asUser = t.withIdentity(TEST_USER);
      const result = await asUser.mutation(api.users.mutations.migrateAnonymousData, {
        localId,
      });

      expect(result.migrated.wishlists).toBe(1);

      // Should have 2 unique products (no duplicate prod-1)
      const wishlist = await t.query(api.wishlists.queries.getWishlist, {
        userId: TEST_USER.subject,
      });
      const productIds = wishlist!.items.map((i) => i.productId).sort();
      expect(productIds).toEqual(["prod-1", "prod-2"]);
    });

    it("migrates tracking events from localId to userId", async () => {
      const t = convexTest();

      const localId = "local-anon-456";
      await seedUserProfile(t, { userId: TEST_USER.subject });
      await seedTrackingEvent(t, { userId: localId, eventType: "product_view" });
      await seedTrackingEvent(t, { userId: localId, eventType: "search" });

      const asUser = t.withIdentity(TEST_USER);
      const result = await asUser.mutation(api.users.mutations.migrateAnonymousData, {
        localId,
      });

      expect(result.migrated.events).toBe(2);

      // Events now belong to the authenticated user
      const events = await t.query(api.tracking.queries.getUserEvents, {
        userId: TEST_USER.subject,
      });
      expect(events).toHaveLength(2);
    });

    it("throws if not authenticated", async () => {
      const t = convexTest();

      await expect(
        t.mutation(api.users.mutations.migrateAnonymousData, { localId: "anon" }),
      ).rejects.toThrow("Not authenticated");
    });

    it("returns zero counts when no anonymous data exists", async () => {
      const t = convexTest();

      await seedUserProfile(t, { userId: TEST_USER.subject });

      const asUser = t.withIdentity(TEST_USER);
      const result = await asUser.mutation(api.users.mutations.migrateAnonymousData, {
        localId: "empty-local-id",
      });

      expect(result.migrated).toEqual({
        wishlists: 0,
        events: 0,
        preferences: 0,
        pushTokens: 0,
        carts: 0,
      });
    });
  });
});
