// convex/admin/queries.ts
//
// Convex queries for admin dashboard, health, merchants, and support.
// Replaces packages/shared/src/clients/admin.ts + health.ts + admin-support.ts (Supabase).
//
// All public queries call assertAdmin() for access control (replaces RLS).
// Internal queries (getHealthDataInternal, checkIsAdmin) skip auth for cron/scheduled use.
//
// Performance notes:
//   - Index ranges on status + _creationTime avoid full table scans
//   - Promise.all for parallel bag lookups instead of sequential N+1
//   - For large-scale deployment, pre-compute metrics via cron + dedicated table
//
// Doc: https://docs.convex.dev/database/reading-data
// Indexes: https://docs.convex.dev/database/reading-data/indexes

import { query, internalQuery } from "../_generated/server";
import type { QueryCtx } from "../_generated/server";
import { v } from "convex/values";
import { assertAdmin } from "../lib/admin";

// ─── Internal Queries (no auth — for cron/scheduled use) ──────────

/**
 * Check if a userId has admin role.
 * Internal — called from actions that already verified auth via ctx.auth.getUserIdentity().
 *
 * Doc: https://docs.convex.dev/functions/internal-functions
 */
export const checkIsAdmin = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const profile = await ctx.db
      .query("userProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();
    return profile?.isAdmin === true;
  },
});

/**
 * Health data for alert evaluation cron. No auth check — cron has no user context.
 * Extracted from public getHealthData to avoid assertAdmin in scheduled context.
 *
 * Uses Date.now() intentionally — internal queries called from actions/crons are NOT
 * reactive subscriptions (Convex best practice exception).
 * Doc: https://docs.convex.dev/scheduling/cron-jobs
 */
export const getHealthDataInternal = internalQuery({
  args: {},
  handler: async (ctx) => fetchHealthMetrics(ctx, Date.now()),
});

// ─── Dashboard Metrics ─────────────────────────────────────────────

/**
 * Get aggregated dashboard metrics for a time range.
 * Replaces the materialized view mv_dashboard_metrics + getAdminDashboardHandler.
 *
 * Performance: uses index range on status + _creationTime to avoid full table scan.
 * _creationTime is auto-appended to all indexes by Convex.
 *
 * Doc: https://docs.convex.dev/database/reading-data/indexes
 */
export const getDashboardData = query({
  args: {
    range: v.string(), // "today" | "7d" | "30d"
    now: v.number(),
  },
  handler: async (ctx, { range, now }) => {
    await assertAdmin(ctx);

    let since: number;
    switch (range) {
      case "today":
        since = new Date(new Date(now).setHours(0, 0, 0, 0)).getTime();
        break;
      case "7d":
        since = now - 7 * 24 * 60 * 60 * 1000;
        break;
      case "30d":
      default:
        since = now - 30 * 24 * 60 * 60 * 1000;
        break;
    }

    // ── Orders — index range on status + _creationTime (no full scan) ──
    // Index by_status is ["status", _creationTime] — Convex appends _creationTime automatically
    const recentCompleted = await ctx.db
      .query("orders")
      .withIndex("by_status", (q) => q.eq("status", "COMPLETED").gte("_creationTime", since))
      .collect(); // Bounded by index range — only completed orders since `since`
    const totalOrders = recentCompleted.length;
    const grossRevenueCents = recentCompleted.reduce((sum, o) => sum + o.total, 0);

    // ── Commission via distributions ──
    // TODO: Pre-compute via cron for scale. Currently bounded to 5000 for safety.
    // orderDistributions has no time-based index — would need schema change for optimal queries.
    const distributions = await ctx.db.query("orderDistributions").take(5000);
    const recentDistributions = distributions.filter((d) => d._creationTime >= since);
    const commissionEstimateCents = recentDistributions
      .filter((d) => d.type === "PAYMENT")
      .reduce((sum, d) => sum + (d.channelAmount ?? d.amount), 0);

    // ── Per-merchant commission — parallel bag lookups via Promise.all ──
    const paymentDistributions = recentDistributions.filter(
      (d) => d.type === "PAYMENT" && d.violetBagId,
    );

    // Safety: cap bag lookups to avoid unbounded parallel queries
    const cappedPaymentDistributions = paymentDistributions.slice(0, 200);

    const merchantTotals = new Map<
      string,
      { name: string; grossSubtotalCents: number; commissionCents: number; bagCount: number }
    >();

    // Parallel lookups — O(N) queries but run concurrently
    // Doc: https://docs.convex.dev/database/reading-data#join
    const bagResults = await Promise.all(
      cappedPaymentDistributions.map(async (dist) => {
        const bag = await ctx.db
          .query("orderBags")
          .withIndex("by_violetBagId", (q) => q.eq("violetBagId", dist.violetBagId!))
          .first();
        return { dist, bag };
      }),
    );

    for (const { dist, bag } of bagResults) {
      if (!bag) continue;
      const merchantName = bag.merchantName ?? "Unknown";
      const existing = merchantTotals.get(merchantName) ?? {
        name: merchantName,
        grossSubtotalCents: 0,
        commissionCents: 0,
        bagCount: 0,
      };
      existing.grossSubtotalCents += bag.subtotal ?? 0;
      existing.commissionCents += dist.channelAmount ?? dist.amount;
      existing.bagCount += 1;
      merchantTotals.set(merchantName, existing);
    }

    const commission = Array.from(merchantTotals.values()).map((m) => ({
      ...m,
      commissionRate:
        m.grossSubtotalCents > 0 ? (m.commissionCents / m.grossSubtotalCents) * 100 : 0,
    }));

    // ── Visitors / conversion ──
    // TODO: Pre-compute unique visitors via cron for scale
    // Bound to 1000 — Convex best practice: keep under 1000 for reactive queries
    const allEvents = await ctx.db.query("userEvents").order("desc").take(1000);
    const recentEvents = allEvents.filter((e) => e._creationTime >= since);
    const totalVisitors = new Set(recentEvents.map((e) => e.userId)).size;
    const conversionRate = totalVisitors > 0 ? (totalOrders / totalVisitors) * 100 : 0;

    return {
      metrics: {
        totalOrders,
        grossRevenueCents,
        commissionEstimateCents,
        activeUsers: totalVisitors,
        totalVisitors,
        conversionRate: Math.round(conversionRate * 100) / 100,
        aiSearchUsagePct: 0, // Not tracked yet
        periodStart: new Date(since).toISOString(),
        periodEnd: new Date(now).toISOString(),
      },
      commission,
    };
  },
});

/**
 * Get order distributions for a specific order.
 */
export const getOrderDistributions = query({
  args: { violetOrderId: v.string() },
  handler: async (ctx, { violetOrderId }) => {
    await assertAdmin(ctx);

    return await ctx.db
      .query("orderDistributions")
      .withIndex("by_violetOrderId", (q) => q.eq("violetOrderId", violetOrderId))
      .collect();
  },
});

// ─── Health & Error Monitoring ─────────────────────────────────────

/**
 * Get platform health data: metrics, recent errors, alert rules.
 * Public query — admin only (assertAdmin).
 * Replaces getAdminHealthHandler.
 */
export const getHealthData = query({
  args: { now: v.number() },
  handler: async (ctx, { now }) => {
    await assertAdmin(ctx);
    return fetchHealthMetrics(ctx, now);
  },
});

/**
 * Shared health metrics aggregation logic.
 * Used by both the public query (with assertAdmin) and the internal query (for cron).
 *
 * Separated to avoid code duplication while keeping auth boundary correct.
 * Cron jobs have no user context → can't call assertAdmin.
 *
 * Doc: https://docs.convex.dev/understanding/best-practices — avoid .collect() on large tables
 */
async function fetchHealthMetrics(ctx: QueryCtx, now: number) {
  const twentyFourHoursAgo = now - 24 * 60 * 60 * 1000;

  // ── Error metrics — take(1000) for accurate 24h counts (was take(20) — sampling bias) ──
  const recentErrors = await ctx.db.query("errorLogs").order("desc").take(1000);
  const errorsLast24h = recentErrors.filter((e) => e._creationTime >= twentyFourHoursAgo);
  const errorCount = errorsLast24h.length;
  const errorRatePerHour = errorCount / 24;

  // Top error types
  const errorTypeCounts = new Map<string, number>();
  for (const err of errorsLast24h) {
    errorTypeCounts.set(err.errorType, (errorTypeCounts.get(err.errorType) ?? 0) + 1);
  }
  const topErrorTypes = Array.from(errorTypeCounts.entries())
    .map(([error_type, count]) => ({ error_type, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // ── Webhook success rate — index range for accurate 24h counts ──
  // by_status index is ["status", _creationTime] — allows time range per status
  const processedWebhooks = await ctx.db
    .query("webhookEvents")
    .withIndex("by_status", (q) =>
      q.eq("status", "processed").gte("_creationTime", twentyFourHoursAgo),
    )
    .collect();
  const failedWebhooks = await ctx.db
    .query("webhookEvents")
    .withIndex("by_status", (q) =>
      q.eq("status", "failed").gte("_creationTime", twentyFourHoursAgo),
    )
    .collect();
  const processed = processedWebhooks.length;
  const failed = failedWebhooks.length;
  const total = processed + failed;
  const webhookSuccessRate = total > 0 ? (processed / total) * 100 : 100;

  // Consecutive webhook failures (check most recent 50 across all statuses)
  const recentForConsecutive = await ctx.db.query("webhookEvents").order("desc").take(50);
  let consecutiveWebhookFailures = 0;
  for (const w of recentForConsecutive) {
    if (w.status === "failed") {
      consecutiveWebhookFailures++;
    } else {
      break;
    }
  }

  // ── Alert rules ──
  const alertRules = await ctx.db.query("alertRules").take(100);

  return {
    metrics: {
      errorCount,
      errorRatePerHour: Math.round(errorRatePerHour * 100) / 100,
      topErrorTypes,
      webhookSuccessRate: Math.round(webhookSuccessRate * 100) / 100,
      consecutiveWebhookFailures,
    },
    recentErrors: recentErrors.slice(0, 20).map((e) => ({
      id: e._id,
      source: e.source,
      errorType: e.errorType,
      message: e.message,
      createdAt: new Date(e._creationTime).toISOString(),
    })),
    alertRules: alertRules.map((r) => ({
      id: r._id,
      ruleName: r.ruleName,
      description: r.description,
      thresholdValue: r.thresholdValue,
      timeWindowMinutes: r.timeWindowMinutes,
      enabled: r.enabled,
      lastTriggeredAt: r.lastTriggeredAt ? new Date(r.lastTriggeredAt).toISOString() : null,
    })),
    healthCheck: null, // On-demand via runHealthCheck query
  };
}

/**
 * Get recent error logs with optional filter.
 */
export const getRecentErrors = query({
  args: {
    limit: v.optional(v.number()),
    source: v.optional(v.string()),
  },
  handler: async (ctx, { limit = 50, source }) => {
    await assertAdmin(ctx);

    if (source) {
      return await ctx.db
        .query("errorLogs")
        .withIndex("by_source_created", (q) => q.eq("source", source))
        .order("desc")
        .take(limit);
    }

    return await ctx.db.query("errorLogs").order("desc").take(limit);
  },
});

/**
 * Get alert rules for health monitoring.
 */
export const getAlertRules = query({
  args: {},
  handler: async (ctx) => {
    await assertAdmin(ctx);
    return await ctx.db.query("alertRules").take(100);
  },
});

// ─── Merchants ─────────────────────────────────────────────────────

/**
 * Get all merchants.
 */
export const getMerchants = query({
  args: {},
  handler: async (ctx) => {
    await assertAdmin(ctx);
    return await ctx.db.query("merchants").take(500);
  },
});

/**
 * Get payout accounts for all merchants.
 */
export const getPayoutAccounts = query({
  args: {},
  handler: async (ctx) => {
    await assertAdmin(ctx);
    return await ctx.db.query("merchantPayoutAccounts").take(500);
  },
});
