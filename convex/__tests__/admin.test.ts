/**
 * Convex tests for admin queries and mutations.
 *
 * Tests: getDashboardData, getHealthData, getRecentErrors, getAlertRules,
 *        getMerchants, getPayoutAccounts, checkIsAdmin, getOrderDistributions
 *
 * Covers: admin access control, dashboard metrics, health monitoring, alert rules.
 *
 * @module convex/__tests__/admin.test
 */
import { describe, it, expect } from "vitest";
import { convexTest, ADMIN_USER, TEST_USER, seedUserProfile } from "./helpers";
import { api, internal } from "../_generated/api";

describe("admin queries", () => {
  // ─── checkIsAdmin (internal) ──────────────────────────────────────

  describe("checkIsAdmin", () => {
    it("returns true for admin user", async () => {
      const t = convexTest();

      await seedUserProfile(t, { userId: ADMIN_USER.subject, isAdmin: true });

      const isAdmin = await t.query(internal.admin.queries.checkIsAdmin, {
        userId: ADMIN_USER.subject,
      });

      expect(isAdmin).toBe(true);
    });

    it("returns false for non-admin user", async () => {
      const t = convexTest();

      await seedUserProfile(t, { userId: TEST_USER.subject, isAdmin: false });

      const isAdmin = await t.query(internal.admin.queries.checkIsAdmin, {
        userId: TEST_USER.subject,
      });

      expect(isAdmin).toBe(false);
    });

    it("returns false for user without profile", async () => {
      const t = convexTest();

      const isAdmin = await t.query(internal.admin.queries.checkIsAdmin, {
        userId: "ghost-user",
      });

      expect(isAdmin).toBe(false);
    });
  });

  // ─── getDashboardData ──────────────────────────────────────────────

  describe("getDashboardData", () => {
    it("throws if not admin", async () => {
      const t = convexTest();

      await seedUserProfile(t, { userId: TEST_USER.subject, isAdmin: false });
      const asUser = t.withIdentity(TEST_USER);

      await expect(
        asUser.query(api.admin.queries.getDashboardData, {
          range: "30d",
          now: Date.now(),
        }),
      ).rejects.toThrow("Admin access required");
    });

    it("returns metrics for admin user", async () => {
      const t = convexTest();

      await seedUserProfile(t, { userId: ADMIN_USER.subject, isAdmin: true });

      // Seed completed orders
      await t.run(async (ctx) => {
        await ctx.db.insert("orders", {
          violetOrderId: "10001",
          status: "COMPLETED",
          email: "buyer@test.com",
          subtotal: 5000,
          shippingTotal: 500,
          taxTotal: 500,
          total: 6000,
          currency: "USD",
          emailSent: false,
        });
      });

      const now = Date.now();
      const asAdmin = t.withIdentity(ADMIN_USER);
      const result = await asAdmin.query(api.admin.queries.getDashboardData, {
        range: "30d",
        now,
      });

      expect(result.metrics).toBeDefined();
      expect(result.metrics.totalOrders).toBe(1);
      expect(result.metrics.grossRevenueCents).toBe(6000);
      expect(result.commission).toBeDefined();
    });

    it("returns zero metrics when no orders", async () => {
      const t = convexTest();

      await seedUserProfile(t, { userId: ADMIN_USER.subject, isAdmin: true });

      const asAdmin = t.withIdentity(ADMIN_USER);
      const result = await asAdmin.query(api.admin.queries.getDashboardData, {
        range: "30d",
        now: Date.now(),
      });

      expect(result.metrics.totalOrders).toBe(0);
      expect(result.metrics.grossRevenueCents).toBe(0);
    });

    it("handles 'today' range", async () => {
      const t = convexTest();

      await seedUserProfile(t, { userId: ADMIN_USER.subject, isAdmin: true });

      const asAdmin = t.withIdentity(ADMIN_USER);
      const result = await asAdmin.query(api.admin.queries.getDashboardData, {
        range: "today",
        now: Date.now(),
      });

      expect(result.metrics).toBeDefined();
    });

    it("handles '7d' range", async () => {
      const t = convexTest();

      await seedUserProfile(t, { userId: ADMIN_USER.subject, isAdmin: true });

      const asAdmin = t.withIdentity(ADMIN_USER);
      const result = await asAdmin.query(api.admin.queries.getDashboardData, {
        range: "7d",
        now: Date.now(),
      });

      expect(result.metrics).toBeDefined();
    });
  });

  // ─── getHealthData ─────────────────────────────────────────────────

  describe("getHealthData", () => {
    it("throws if not admin", async () => {
      const t = convexTest();

      await seedUserProfile(t, { userId: TEST_USER.subject, isAdmin: false });
      const asUser = t.withIdentity(TEST_USER);

      await expect(
        asUser.query(api.admin.queries.getHealthData, { now: Date.now() }),
      ).rejects.toThrow("Admin access required");
    });

    it("returns health metrics for admin", async () => {
      const t = convexTest();

      await seedUserProfile(t, { userId: ADMIN_USER.subject, isAdmin: true });

      // Seed some error logs
      await t.run(async (ctx) => {
        await ctx.db.insert("errorLogs", {
          source: "web",
          errorType: "network",
          message: "Connection timeout",
        });
        await ctx.db.insert("errorLogs", {
          source: "convex",
          errorType: "validation",
          message: "Invalid input",
        });
      });

      // Seed alert rule
      await t.run(async (ctx) => {
        await ctx.db.insert("alertRules", {
          ruleName: "webhook_consecutive_failures",
          description: "Alert on consecutive webhook failures",
          thresholdValue: 5,
          timeWindowMinutes: 15,
          enabled: true,
        });
      });

      const asAdmin = t.withIdentity(ADMIN_USER);
      const result = await asAdmin.query(api.admin.queries.getHealthData, {
        now: Date.now(),
      });

      expect(result.metrics).toBeDefined();
      expect(result.metrics.errorCount).toBe(2);
      expect(result.metrics.topErrorTypes).toHaveLength(2);
      expect(result.alertRules).toHaveLength(1);
      expect(result.alertRules[0].ruleName).toBe("webhook_consecutive_failures");
      expect(result.recentErrors).toHaveLength(2);
    });

    it("calculates webhook success rate", async () => {
      const t = convexTest();

      await seedUserProfile(t, { userId: ADMIN_USER.subject, isAdmin: true });

      await t.run(async (ctx) => {
        await ctx.db.insert("webhookEvents", {
          eventId: "evt-1",
          eventType: "ORDER_UPDATED",
          entityId: "100",
          status: "processed",
        });
        await ctx.db.insert("webhookEvents", {
          eventId: "evt-2",
          eventType: "BAG_SHIPPED",
          entityId: "200",
          status: "processed",
        });
        await ctx.db.insert("webhookEvents", {
          eventId: "evt-3",
          eventType: "ORDER_UPDATED",
          entityId: "101",
          status: "failed",
          errorMessage: "Timeout",
        });
      });

      const asAdmin = t.withIdentity(ADMIN_USER);
      const result = await asAdmin.query(api.admin.queries.getHealthData, {
        now: Date.now(),
      });

      // 2 processed, 1 failed = 66.67%
      expect(result.metrics.webhookSuccessRate).toBeCloseTo(66.67, 1);
      expect(result.metrics.consecutiveWebhookFailures).toBe(1);
    });
  });

  // ─── getRecentErrors ───────────────────────────────────────────────

  describe("getRecentErrors", () => {
    it("returns recent errors ordered newest first", async () => {
      const t = convexTest();

      await seedUserProfile(t, { userId: ADMIN_USER.subject, isAdmin: true });

      await t.run(async (ctx) => {
        await ctx.db.insert("errorLogs", {
          source: "web",
          errorType: "network",
          message: "Error A",
        });
        await ctx.db.insert("errorLogs", {
          source: "convex",
          errorType: "validation",
          message: "Error B",
        });
      });

      const asAdmin = t.withIdentity(ADMIN_USER);
      const errors = await asAdmin.query(api.admin.queries.getRecentErrors, {});

      expect(errors).toHaveLength(2);
      expect(errors[0].message).toBe("Error B"); // Newest first
    });

    it("filters by source", async () => {
      const t = convexTest();

      await seedUserProfile(t, { userId: ADMIN_USER.subject, isAdmin: true });

      await t.run(async (ctx) => {
        await ctx.db.insert("errorLogs", {
          source: "web",
          errorType: "network",
          message: "Web error",
        });
        await ctx.db.insert("errorLogs", {
          source: "convex",
          errorType: "validation",
          message: "Convex error",
        });
      });

      const asAdmin = t.withIdentity(ADMIN_USER);
      const errors = await asAdmin.query(api.admin.queries.getRecentErrors, {
        source: "convex",
      });

      expect(errors).toHaveLength(1);
      expect(errors[0].source).toBe("convex");
    });

    it("respects limit", async () => {
      const t = convexTest();

      await seedUserProfile(t, { userId: ADMIN_USER.subject, isAdmin: true });

      await t.run(async (ctx) => {
        for (let i = 0; i < 5; i++) {
          await ctx.db.insert("errorLogs", {
            source: "web",
            errorType: "test",
            message: `Error ${i}`,
          });
        }
      });

      const asAdmin = t.withIdentity(ADMIN_USER);
      const errors = await asAdmin.query(api.admin.queries.getRecentErrors, { limit: 3 });

      expect(errors).toHaveLength(3);
    });
  });

  // ─── getAlertRules ─────────────────────────────────────────────────

  describe("getAlertRules", () => {
    it("returns alert rules", async () => {
      const t = convexTest();

      await seedUserProfile(t, { userId: ADMIN_USER.subject, isAdmin: true });

      await t.run(async (ctx) => {
        await ctx.db.insert("alertRules", {
          ruleName: "error_rate_spike",
          description: "Error rate too high",
          thresholdValue: 10,
          timeWindowMinutes: 60,
          enabled: true,
        });
      });

      const asAdmin = t.withIdentity(ADMIN_USER);
      const rules = await asAdmin.query(api.admin.queries.getAlertRules, {});

      expect(rules).toHaveLength(1);
      expect(rules[0].ruleName).toBe("error_rate_spike");
      expect(rules[0].thresholdValue).toBe(10);
    });
  });

  // ─── getMerchants ─────────────────────────────────────────────────

  describe("getMerchants", () => {
    it("returns all merchants", async () => {
      const t = convexTest();

      await seedUserProfile(t, { userId: ADMIN_USER.subject, isAdmin: true });

      await t.run(async (ctx) => {
        await ctx.db.insert("merchants", {
          violetMerchantId: 1001,
          name: "StyleSphere",
          status: "active",
        });
        await ctx.db.insert("merchants", {
          violetMerchantId: 1002,
          name: "EcoWear",
          status: "active",
        });
      });

      const asAdmin = t.withIdentity(ADMIN_USER);
      const merchants = await asAdmin.query(api.admin.queries.getMerchants, {});

      expect(merchants).toHaveLength(2);
    });
  });

  // ─── getOrderDistributions ─────────────────────────────────────────

  describe("getOrderDistributions", () => {
    it("returns distributions for a given order", async () => {
      const t = convexTest();

      await seedUserProfile(t, { userId: ADMIN_USER.subject, isAdmin: true });

      await t.run(async (ctx) => {
        await ctx.db.insert("orderDistributions", {
          violetOrderId: "10001",
          type: "PAYMENT",
          amount: 5000,
        });
        await ctx.db.insert("orderDistributions", {
          violetOrderId: "10001",
          type: "REFUND",
          amount: 2500,
        });
        await ctx.db.insert("orderDistributions", {
          violetOrderId: "10002",
          type: "PAYMENT",
          amount: 3000,
        });
      });

      const asAdmin = t.withIdentity(ADMIN_USER);
      const distributions = await asAdmin.query(api.admin.queries.getOrderDistributions, {
        violetOrderId: "10001",
      });

      expect(distributions).toHaveLength(2);
    });
  });
});
