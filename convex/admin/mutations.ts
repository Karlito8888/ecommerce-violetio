// convex/admin/mutations.ts
//
// Convex mutations for admin actions: support management, alert evaluation.
// Phase 9: replaces Supabase-based updateSupportInquiryHandler, replySupportInquiryHandler.
//
// Doc: https://docs.convex.dev/database/writing-data

import { internalMutation, internalAction, action } from "../_generated/server";
import { v } from "convex/values";
import { api, internal } from "../_generated/api";
import { escapeHtml, sendRawEmail } from "../lib/email";

// ─── Support Management ─────────────────────────────────────────────

/**
 * Send a reply email to a support inquiry customer and auto-advance status.
 * Replaces replySupportInquiryHandler + Edge Function send-support-reply.
 */
export const replyToSupportInquiry = action({
  args: {
    inquiryId: v.id("supportInquiries"),
    replyMessage: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { inquiryId, replyMessage }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    // Verify admin role — actions have auth context but need explicit check
    // Doc: https://docs.convex.dev/auth/functions-auth
    const isAdmin = await ctx.runQuery(internal.admin.queries.checkIsAdmin, {
      userId: identity.subject,
    });
    if (!isAdmin) throw new Error("Admin access required");

    const inquiry = await ctx.runQuery(api.support.queries.getSupportInquiry, { inquiryId });
    if (!inquiry) throw new Error("Inquiry not found");

    // Send reply email via centralized email helper (DRY)
    if (process.env.AUTH_RESEND_KEY) {
      await sendRawEmail({
        to: inquiry.email,
        subject: `Re: ${inquiry.subject}`,
        html: `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
  <p>Hi ${escapeHtml(inquiry.name)},</p>
  <p>${escapeHtml(replyMessage).replace(/\n/g, "<br>")}</p>
  <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
  <p style="color: #888; font-size: 13px;">Maison Émile — <a href="https://maisonemile.com">maisonemile.com</a></p>
</div>`,
        text: `Hi ${inquiry.name},\n\n${replyMessage}\n\n— Maison Émile`,
        fromName: "Maison Émile Support",
      });
    }

    // Auto-advance status: new → in-progress
    if (inquiry.status === "new") {
      await ctx.runMutation(api.support.mutations.updateInquiryStatus, {
        inquiryId,
        status: "in-progress",
      });
    }
  },
});

// ─── Alert Evaluation ──────────────────────────────────────────────

/**
 * Evaluate alert rules and send notification emails when thresholds are breached.
 * Called by the precomputeDashboard cron job.
 */
export const evaluateAlerts = internalAction({
  args: {},
  handler: async (ctx) => {
    // Use internal query (no assertAdmin) — cron has no user auth context.
    // Public getHealthData would crash: assertAdmin → ctx.auth.getUserIdentity() === null.
    // Doc: https://docs.convex.dev/scheduling/cron-jobs — cron jobs have no auth
    const healthData = await ctx.runQuery(internal.admin.queries.getHealthDataInternal, {});
    const { metrics, alertRules } = healthData;

    const ADMIN_EMAIL = process.env.ADMIN_ALERT_EMAIL;

    if (!process.env.AUTH_RESEND_KEY || !ADMIN_EMAIL) return;

    const now = Date.now();

    for (const rule of alertRules) {
      if (!rule.enabled) continue;

      // Debounce: skip if triggered within the time window
      if (rule.lastTriggeredAt) {
        const lastTriggered = new Date(rule.lastTriggeredAt).getTime();
        const debounceMinutes = rule.timeWindowMinutes > 0 ? rule.timeWindowMinutes : 15;
        if (now - lastTriggered < debounceMinutes * 60 * 1000) continue;
      }

      let breached = false;
      let detail = "";

      switch (rule.ruleName) {
        case "webhook_consecutive_failures":
          breached = metrics.consecutiveWebhookFailures >= rule.thresholdValue;
          detail = `${metrics.consecutiveWebhookFailures} consecutive webhook failures (threshold: ${rule.thresholdValue})`;
          break;
        case "failed_checkouts_spike": {
          const checkoutErrors = metrics.topErrorTypes
            .filter((e) => e.error_type.startsWith("CHECKOUT."))
            .reduce((sum, e) => sum + e.count, 0);
          breached = checkoutErrors >= rule.thresholdValue;
          detail = `${checkoutErrors} checkout failures in window (threshold: ${rule.thresholdValue})`;
          break;
        }
        case "error_rate_spike":
          breached = metrics.errorRatePerHour >= rule.thresholdValue;
          detail = `Error rate: ${metrics.errorRatePerHour.toFixed(1)}/hr (threshold: ${rule.thresholdValue}/hr)`;
          break;
      }

      if (!breached) continue;

      // Send alert email via centralized helper (DRY)
      try {
        await sendRawEmail({
          to: ADMIN_EMAIL,
          subject: `[Alert] ${rule.ruleName.replace(/_/g, " ")}`,
          text: `Platform health alert triggered.\n\nRule: ${rule.ruleName}\n${detail}\nTime: ${new Date(now).toISOString()}`,
          html: `<p>Platform health alert triggered.</p><p><strong>Rule:</strong> ${escapeHtml(rule.ruleName)}<br>${escapeHtml(detail)}<br><em>Time: ${new Date(now).toISOString()}</em></p>`,
          fromName: "Maison Émile Alerts",
        });
      } catch {
        // Email failure should not break evaluation
      }

      // Update lastTriggeredAt
      await ctx.runMutation(internal.admin.mutations.updateAlertTriggerTime, {
        ruleName: rule.ruleName,
        triggeredAt: now,
      });
    }
  },
});

/**
 * Update the lastTriggeredAt timestamp for an alert rule.
 * Internal mutation — called by evaluateAlerts action.
 */
export const updateAlertTriggerTime = internalMutation({
  args: {
    ruleName: v.string(),
    triggeredAt: v.number(),
  },
  handler: async (ctx, { ruleName, triggeredAt }) => {
    const rule = await ctx.db
      .query("alertRules")
      .withIndex("by_ruleName", (q) => q.eq("ruleName", ruleName))
      .first();

    if (rule) {
      await ctx.db.patch("alertRules", rule._id, { lastTriggeredAt: triggeredAt });
    }
  },
});

// ─── Helpers ──────────────────────────────────────────────────────
// escapeHtml is imported from ../lib/email (DRY)
