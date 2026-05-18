/**
 * Convex tests for tracking queries and mutations.
 *
 * Tests: recordEvent, getUserEvents
 * Covers: anonymous + authenticated events, type filtering, limit.
 *
 * @module convex/__tests__/tracking.test
 */
import { describe, it, expect } from "vitest";
import { convexTest, TEST_USER as _TEST_USER, seedTrackingEvent } from "./helpers";
import { api } from "../_generated/api";

describe("tracking", () => {
  // ─── recordEvent ──────────────────────────────────────────────────

  describe("recordEvent", () => {
    it("records a tracking event", async () => {
      const t = convexTest();

      await t.mutation(api.tracking.mutations.recordEvent, {
        userId: "user-A",
        eventType: "product_view",
        payload: { productId: "prod-1" },
      });

      const events = await t.query(api.tracking.queries.getUserEvents, {
        userId: "user-A",
      });

      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe("product_view");
      expect(events[0].payload).toEqual({ productId: "prod-1" });
    });

    it("records event without payload", async () => {
      const t = convexTest();

      await t.mutation(api.tracking.mutations.recordEvent, {
        userId: "user-A",
        eventType: "page_view",
      });

      const events = await t.query(api.tracking.queries.getUserEvents, {
        userId: "user-A",
      });

      expect(events).toHaveLength(1);
      expect(events[0].payload).toBeUndefined();
    });

    it("records events for localId (anonymous)", async () => {
      const t = convexTest();

      const localId = "local-anon-789";
      await t.mutation(api.tracking.mutations.recordEvent, {
        userId: localId,
        eventType: "search",
        payload: { query: "running shoes" },
      });

      const events = await t.query(api.tracking.queries.getUserEvents, {
        userId: localId,
      });

      expect(events).toHaveLength(1);
      expect(events[0].userId).toBe(localId);
    });
  });

  // ─── getUserEvents ────────────────────────────────────────────────

  describe("getUserEvents", () => {
    it("returns all events for a user sorted newest first", async () => {
      const t = convexTest();

      await seedTrackingEvent(t, { userId: "user-A", eventType: "product_view" });
      await seedTrackingEvent(t, { userId: "user-A", eventType: "search" });

      const events = await t.query(api.tracking.queries.getUserEvents, {
        userId: "user-A",
      });

      expect(events).toHaveLength(2);
      // Newest first
      expect(events[0].eventType).toBe("search");
      expect(events[1].eventType).toBe("product_view");
    });

    it("filters by eventType", async () => {
      const t = convexTest();

      await seedTrackingEvent(t, { userId: "user-A", eventType: "product_view" });
      await seedTrackingEvent(t, { userId: "user-A", eventType: "search" });
      await seedTrackingEvent(t, { userId: "user-A", eventType: "product_view" });

      const events = await t.query(api.tracking.queries.getUserEvents, {
        userId: "user-A",
        eventType: "product_view",
      });

      expect(events).toHaveLength(2);
      expect(events.every((e) => e.eventType === "product_view")).toBe(true);
    });

    it("respects limit parameter", async () => {
      const t = convexTest();

      for (let i = 0; i < 5; i++) {
        await seedTrackingEvent(t, { userId: "user-A", eventType: "page_view" });
      }

      const events = await t.query(api.tracking.queries.getUserEvents, {
        userId: "user-A",
        limit: 3,
      });

      expect(events).toHaveLength(3);
    });

    it("returns empty array for user with no events", async () => {
      const t = convexTest();

      const events = await t.query(api.tracking.queries.getUserEvents, {
        userId: "ghost-user",
      });

      expect(events).toEqual([]);
    });

    it("does not return events from other users", async () => {
      const t = convexTest();

      await seedTrackingEvent(t, { userId: "user-A", eventType: "product_view" });
      await seedTrackingEvent(t, { userId: "user-B", eventType: "search" });

      const events = await t.query(api.tracking.queries.getUserEvents, {
        userId: "user-A",
      });

      expect(events).toHaveLength(1);
      expect(events[0].userId).toBe("user-A");
    });
  });
});
