/**
 * Convex tests for support queries and mutations.
 *
 * Tests: insertSupportInquiry, getSupportInquiries, getSupportInquiry,
 *        updateInquiryStatus, updateInternalNotes, getLinkedOrder,
 *        countRecentInquiries
 *
 * Covers: public insertion, admin access control, rate limiting.
 *
 * @module convex/__tests__/support.test
 */
import { describe, it, expect } from "vitest";
import { convexTest, ADMIN_USER, seedUserProfile, seedSupportInquiry, seedOrder } from "./helpers";
import { api } from "../_generated/api";

describe("support", () => {
  // ─── insertSupportInquiry (public — no auth) ─────────────────────

  describe("insertSupportInquiry", () => {
    it("creates a new inquiry with status 'new'", async () => {
      const t = convexTest();

      const id = await t.mutation(api.support.mutations.insertSupportInquiry, {
        name: "Jane Doe",
        email: "jane@example.com",
        subject: "Order Issue",
        message: "My order is missing an item.",
      });

      expect(id).toBeDefined();

      // Verify via admin query
      await seedUserProfile(t, { userId: ADMIN_USER.subject, isAdmin: true });
      const asAdmin = t.withIdentity(ADMIN_USER);
      const inquiries = await asAdmin.query(api.support.queries.getSupportInquiries);
      expect(inquiries).toHaveLength(1);
      expect(inquiries[0]).toMatchObject({
        name: "Jane Doe",
        email: "jane@example.com",
        subject: "Order Issue",
        message: "My order is missing an item.",
        status: "new",
      });
    });

    it("creates inquiry with optional orderId", async () => {
      const t = convexTest();

      const id = await t.mutation(api.support.mutations.insertSupportInquiry, {
        name: "Jane",
        email: "jane@example.com",
        subject: "Where is my order?",
        message: "It's been 2 weeks.",
        orderId: "VIOLET-123",
      });

      expect(id).toBeDefined();

      await seedUserProfile(t, { userId: ADMIN_USER.subject, isAdmin: true });
      const asAdmin = t.withIdentity(ADMIN_USER);
      const inquiries = await asAdmin.query(api.support.queries.getSupportInquiries);
      expect(inquiries[0].orderId).toBe("VIOLET-123");
    });
  });

  // ─── getSupportInquiries (admin) ─────────────────────────────────

  describe("getSupportInquiries", () => {
    it("throws if not admin", async () => {
      const t = convexTest();

      // withIdentity creates a user in auth tables but no admin profile
      const asAdmin = t.withIdentity(ADMIN_USER);
      await expect(asAdmin.query(api.support.queries.getSupportInquiries)).rejects.toThrow(
        "Admin access required",
      );
    });

    it("returns all inquiries ordered newest first", async () => {
      const t = convexTest();

      await seedUserProfile(t, { userId: ADMIN_USER.subject, isAdmin: true });
      await seedSupportInquiry(t, { email: "a@test.com" });
      await seedSupportInquiry(t, { email: "b@test.com" });

      const asAdmin = t.withIdentity(ADMIN_USER);
      const inquiries = await asAdmin.query(api.support.queries.getSupportInquiries);

      expect(inquiries).toHaveLength(2);
      // Newest first (b was inserted after a)
      expect(inquiries[0].email).toBe("b@test.com");
      expect(inquiries[1].email).toBe("a@test.com");
    });

    it("filters by status", async () => {
      const t = convexTest();

      await seedUserProfile(t, { userId: ADMIN_USER.subject, isAdmin: true });
      await seedSupportInquiry(t, { status: "new" });
      await seedSupportInquiry(t, { status: "resolved" });

      const asAdmin = t.withIdentity(ADMIN_USER);
      const inquiries = await asAdmin.query(api.support.queries.getSupportInquiries, {
        status: "new",
      });

      expect(inquiries).toHaveLength(1);
      expect(inquiries[0].status).toBe("new");
    });
  });

  // ─── getSupportInquiry (admin) ───────────────────────────────────

  describe("getSupportInquiry", () => {
    it("returns a single inquiry by ID", async () => {
      const t = convexTest();

      await seedUserProfile(t, { userId: ADMIN_USER.subject, isAdmin: true });
      const inquiryId = await seedSupportInquiry(t, {
        name: "Test User",
        subject: "Help needed",
      });

      const asAdmin = t.withIdentity(ADMIN_USER);
      const inquiry = await asAdmin.query(api.support.queries.getSupportInquiry, {
        inquiryId,
      });

      expect(inquiry).not.toBeNull();
      expect(inquiry!.name).toBe("Test User");
      expect(inquiry!.subject).toBe("Help needed");
    });
  });

  // ─── updateInquiryStatus (admin) ─────────────────────────────────

  describe("updateInquiryStatus", () => {
    it("updates inquiry status", async () => {
      const t = convexTest();

      await seedUserProfile(t, { userId: ADMIN_USER.subject, isAdmin: true });
      const inquiryId = await seedSupportInquiry(t, { status: "new" });

      const asAdmin = t.withIdentity(ADMIN_USER);
      await asAdmin.mutation(api.support.mutations.updateInquiryStatus, {
        inquiryId,
        status: "in-progress",
      });

      const inquiry = await asAdmin.query(api.support.queries.getSupportInquiry, {
        inquiryId,
      });
      expect(inquiry!.status).toBe("in-progress");
    });

    it("throws if not admin", async () => {
      const t = convexTest();

      const inquiryId = await seedSupportInquiry(t);
      const asAdmin = t.withIdentity(ADMIN_USER);

      await expect(
        asAdmin.mutation(api.support.mutations.updateInquiryStatus, {
          inquiryId,
          status: "resolved",
        }),
      ).rejects.toThrow();
    });
  });

  // ─── updateInternalNotes (admin) ─────────────────────────────────

  describe("updateInternalNotes", () => {
    it("adds internal notes", async () => {
      const t = convexTest();

      await seedUserProfile(t, { userId: ADMIN_USER.subject, isAdmin: true });
      const inquiryId = await seedSupportInquiry(t);

      const asAdmin = t.withIdentity(ADMIN_USER);
      await asAdmin.mutation(api.support.mutations.updateInternalNotes, {
        inquiryId,
        notes: "Contacted user via email.",
      });

      const inquiry = await asAdmin.query(api.support.queries.getSupportInquiry, {
        inquiryId,
      });
      expect(inquiry!.internalNotes).toBe("Contacted user via email.");
    });
  });

  // ─── countRecentInquiries (rate limiting) ────────────────────────

  describe("countRecentInquiries", () => {
    it("returns count of recent inquiries from same email", async () => {
      const t = convexTest();

      await seedSupportInquiry(t, { email: "rate@test.com" });
      await seedSupportInquiry(t, { email: "rate@test.com" });
      await seedSupportInquiry(t, { email: "other@test.com" });

      const count = await t.query(api.support.queries.countRecentInquiries, {
        email: "rate@test.com",
        now: Date.now(),
      });

      expect(count).toBe(2);
    });

    it("returns 0 for email with no inquiries", async () => {
      const t = convexTest();

      const count = await t.query(api.support.queries.countRecentInquiries, {
        email: "none@test.com",
        now: Date.now(),
      });

      expect(count).toBe(0);
    });
  });

  // ─── getLinkedOrder (admin) ──────────────────────────────────────

  describe("getLinkedOrder", () => {
    it("returns order matching violetOrderId", async () => {
      const t = convexTest();

      await seedUserProfile(t, { userId: ADMIN_USER.subject, isAdmin: true });
      await seedOrder(t, { violetOrderId: "VIOLET-123" });

      const asAdmin = t.withIdentity(ADMIN_USER);
      const order = await asAdmin.query(api.support.queries.getLinkedOrder, {
        violetOrderId: "VIOLET-123",
      });

      expect(order).not.toBeNull();
      expect(order!.violetOrderId).toBe("VIOLET-123");
    });

    it("returns null for non-existent order", async () => {
      const t = convexTest();

      await seedUserProfile(t, { userId: ADMIN_USER.subject, isAdmin: true });

      const asAdmin = t.withIdentity(ADMIN_USER);
      const order = await asAdmin.query(api.support.queries.getLinkedOrder, {
        violetOrderId: "NONEXISTENT",
      });

      expect(order).toBeNull();
    });
  });
});
