// convex/crons.ts
//
// Scheduled jobs for Convex.
// Replaces Supabase pg_cron + manual cleanup scripts.
//
// Convex crons run as internal mutations at specified intervals.
// They run on the Convex backend (self-hosted binary) with full DB access.
//
// Doc: https://docs.convex.dev/scheduling/cron-jobs

import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";

const crons = cronJobs();

// ─── Internal Mutations (cron handlers) ──────────────────────────────────────

/**
 * Clean up webhook events older than 90 days.
 * Keeps the webhookEvents table manageable — old events are no longer needed
 * for idempotency (Violet retries max 10 times over 24h).
 */
export const cleanupOldWebhooks = internalMutation({
  args: {},
  handler: async (ctx) => {
    const ninetyDaysAgo = Date.now() - 90 * 24 * 60 * 60 * 1000;

    // Process in batches of 500 to avoid exceeding Convex function limits.
    // Convex enforces limits on reads/writes per function invocation.
    // Doc: https://docs.convex.dev/understanding/best-practices — avoid unbounded .collect()
    const oldEvents = await ctx.db
      .query("webhookEvents")
      .filter((q) => q.lt(q.field("_creationTime"), ninetyDaysAgo))
      .take(500);

    for (const event of oldEvents) {
      await ctx.db.delete(event._id);
    }

    if (oldEvents.length > 0) {
      console.log(
        `[cron:cleanup-webhooks] Deleted ${oldEvents.length} old webhook events` +
          (oldEvents.length === 500 ? " (more remaining — will continue next run)" : ""),
      );
    }
  },
});

/**
 * Clean up abandoned carts (status = "abandoned" and older than 30 days).
 * Also cleans up cart_items for those carts.
 */
export const cleanupAbandonedCarts = internalMutation({
  args: {},
  handler: async (ctx) => {
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

    const abandonedCarts = await ctx.db
      .query("carts")
      .filter((q) =>
        q.and(q.eq(q.field("status"), "abandoned"), q.lt(q.field("_creationTime"), thirtyDaysAgo)),
      )
      .collect();

    let deletedCarts = 0;
    for (const cart of abandonedCarts) {
      // Delete cart items first
      const items = await ctx.db
        .query("cartItems")
        .withIndex("by_cart_sku", (q) => q.eq("cartId", cart._id))
        .collect();

      for (const item of items) {
        await ctx.db.delete(item._id);
      }

      await ctx.db.delete(cart._id);
      deletedCarts++;
    }

    console.log(`[cron:cleanup-carts] Deleted ${deletedCarts} abandoned carts`);
  },
});

/**
 * Check for webhook events stuck in "received" status for over 1 hour.
 * These may indicate processing failures that need manual investigation.
 */
export const retryStuckWebhooks = internalMutation({
  args: {},
  handler: async (ctx) => {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;

    const stuckEvents = await ctx.db
      .query("webhookEvents")
      .withIndex("by_status", (q) => q.eq("status", "received"))
      .filter((q) => q.lt(q.field("_creationTime"), oneHourAgo))
      .take(50);

    if (stuckEvents.length > 0) {
      console.warn(
        `[cron:retry-webhooks] Found ${stuckEvents.length} stuck webhook events. ` +
          `Event IDs: ${stuckEvents.map((e) => e.eventId).join(", ")}`,
      );

      for (const event of stuckEvents) {
        await ctx.db.patch(event._id, {
          status: "failed",
          errorMessage: "Auto-marked as failed after 1 hour in 'received' status",
          processedAt: Date.now(),
        });
      }
    }
  },
});

// ─── Cron Schedule Definitions ───────────────────────────────────────────────

// Clean up old webhook events monthly (1st of each month at 3:00 AM UTC)
crons.monthly(
  "cleanup-old-webhooks",
  { day: 1, hourUTC: 3, minuteUTC: 0 },
  internal.crons.cleanupOldWebhooks,
);

// Clean up abandoned carts daily at 4:00 AM UTC
crons.daily(
  "cleanup-abandoned-carts",
  { hourUTC: 4, minuteUTC: 0 },
  internal.crons.cleanupAbandonedCarts,
);

// Check for stuck webhook events hourly (at :15)
crons.hourly("retry-stuck-webhooks", { minuteUTC: 15 }, internal.crons.retryStuckWebhooks);

// Evaluate alert rules hourly (at :45) — sends admin emails when thresholds are breached
// Uses an internalMutation wrapper that schedules the internalAction
export const triggerEvaluateAlerts = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Schedule the action to run immediately (fire-and-forget from cron's perspective)
    ctx.scheduler.runAfter(0, internal.admin.mutations.evaluateAlerts, {});
  },
});

crons.hourly("evaluate-alerts", { minuteUTC: 45 }, internal.crons.triggerEvaluateAlerts);

export default crons;
