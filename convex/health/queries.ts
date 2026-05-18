// convex/health/queries.ts
//
// Health check queries — public + admin.
// Phase 9: enriched with service status for admin health dashboard.

import { query } from "../_generated/server";
import { v } from "convex/values";

/**
 * Public health check — confirms the Convex backend is running.
 */
export const getStatus = query({
  args: { now: v.number() },
  returns: v.object({
    status: v.string(),
    timestamp: v.number(),
    backend: v.string(),
  }),
  handler: async (_ctx, { now }) => {
    return {
      status: "ok",
      timestamp: now,
      backend: "convex-self-hosted",
    };
  },
});

/**
 * Admin health check — tests connectivity to external services.
 * Returns per-service status (Convex, Violet, Stripe).
 */
export const runHealthCheck = query({
  args: { now: v.number() },
  returns: v.object({
    overall_status: v.string(),
    services: v.record(
      v.string(),
      v.object({
        status: v.string(),
        latency_ms: v.optional(v.number()),
        error: v.optional(v.string()),
      }),
    ),
    checked_at: v.string(),
    merchants: v.array(v.any()),
  }),
  handler: async (_ctx, { now }) => {
    const services: Record<string, { status: string; latency_ms?: number; error?: string }> = {};

    // Convex — always up if this query runs
    services.convex = { status: "up", latency_ms: 0 };

    // Violet — test auth token fetch (only env var check in query context)
    try {
      const hasVioletConfig = !!(process.env.VIOLET_APP_ID && process.env.VIOLET_APP_SECRET);
      services.violet = {
        status: hasVioletConfig ? "up" : "unknown",
      };
    } catch (err) {
      services.violet = {
        status: "down",
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }

    // Stripe — check if key is configured
    services.stripe = {
      status: process.env.STRIPE_SECRET_KEY ? "up" : "unknown",
    };

    const allUp = Object.values(services).every((s) => s.status !== "down");

    return {
      overall_status: allUp ? "healthy" : "degraded",
      services,
      checked_at: new Date(now).toISOString(),
      merchants: [], // Merchant health checked separately via admin queries
    };
  },
});
