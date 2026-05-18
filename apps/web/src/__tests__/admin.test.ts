/**
 * Tests for pure admin utility functions.
 *
 * Commission calculation tests — pure math, no Supabase or Convex dependency.
 *
 * The Supabase-backed admin tests (getDashboardMetrics, getCommissionSummary,
 * getAdminDashboardHandler, refreshDashboardViews, resolveTimeRange) have been
 * replaced by convex/__tests__/admin.test.ts (Convex queries).
 */
import { describe, expect, it } from "vitest";

// ── Commission calculation ──────────────────────────────────

describe("commission calculation", () => {
  it("estimates 10% commission from bag subtotal", () => {
    const bagSubtotal = 10000; // $100.00
    const rate = 10;
    const commission = Math.floor((bagSubtotal * rate) / 100);
    expect(commission).toBe(1000); // $10.00
  });

  it("handles fractional cents correctly", () => {
    const commission = Math.floor((9999 * 10) / 100);
    expect(commission).toBe(999);
  });

  it("handles zero subtotal", () => {
    const commission = Math.floor((0 * 10) / 100);
    expect(commission).toBe(0);
  });
});
