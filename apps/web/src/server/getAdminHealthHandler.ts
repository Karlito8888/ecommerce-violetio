import type {
  PlatformHealthData,
  HealthCheckResult,
  HealthMetrics,
  AlertRule,
} from "@ecommerce/shared";
import { getHealthMetrics, getRecentErrors, getAlertRules } from "@ecommerce/shared";

import { getSupabaseServer } from "#/server/supabaseServer";
import { requireAdminOrThrow } from "#/server/adminAuthGuard";

/**
 * Evaluate alert rules against current metrics.
 * If a threshold is breached and the debounce window has expired,
 * sends an admin email via Resend and updates last_triggered_at.
 */
async function evaluateAlerts(metrics: HealthMetrics, alertRules: AlertRule[]): Promise<void> {
  const resendApiKey = process.env.RESEND_API_KEY;
  const adminEmail = process.env.ADMIN_ALERT_EMAIL;

  if (!resendApiKey || !adminEmail) return;

  const serviceClient = getSupabaseServer();
  const now = new Date();

  for (const rule of alertRules) {
    if (!rule.enabled) continue;

    // Debounce: skip if triggered within the time window (or 15 min for window=0 rules)
    if (rule.lastTriggeredAt) {
      const lastTriggered = new Date(rule.lastTriggeredAt);
      const debounceMinutes = rule.timeWindowMinutes > 0 ? rule.timeWindowMinutes : 15;
      const debounceMs = debounceMinutes * 60 * 1000;
      if (now.getTime() - lastTriggered.getTime() < debounceMs) continue;
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
      case "edge_function_error_rate": {
        const totalErrors = metrics.errorCount;
        const efErrors = metrics.topErrorTypes
          .filter((e) => e.error_type.startsWith("EDGE_FUNCTION."))
          .reduce((sum, e) => sum + e.count, 0);
        const rate = totalErrors > 0 ? (efErrors / totalErrors) * 100 : 0;
        breached = rate >= rule.thresholdValue;
        detail = `Edge Function error rate: ${rate.toFixed(1)}% (threshold: ${rule.thresholdValue}%)`;
        break;
      }
      // violet_unreachable is evaluated via health check, not metrics — handled by triggerHealthCheckHandler
    }

    if (!breached) continue;

    // Send alert email via Resend (fire-and-forget)
    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "Maison Émile Alerts <alerts@maisonemile.com>",
          to: [adminEmail],
          subject: `[Alert] ${rule.ruleName.replace(/_/g, " ")}`,
          text: `Platform health alert triggered.\n\nRule: ${rule.ruleName}\n${detail}\nTime: ${now.toISOString()}`,
        }),
      });
    } catch {
      // Email send failure should not break the health dashboard
    }

    // Update last_triggered_at (fire-and-forget)
    serviceClient
      .from("alert_rules")
      .update({ last_triggered_at: now.toISOString() })
      .eq("id", rule.id)
      .then();
  }
}

/**
 * Handler for admin health monitoring data.
 *
 * Uses service role client for:
 * - fn_health_metrics RPC (SECURITY DEFINER, service_role only)
 * - error_logs query (admin_read_errors policy via session, but service_role is simpler)
 * - alert_rules query
 *
 * Also evaluates alert thresholds and sends admin email notifications
 * when breached (debounced by time window).
 */
export async function getAdminHealthHandler(): Promise<PlatformHealthData> {
  await requireAdminOrThrow();

  const serviceClient = getSupabaseServer();

  const [metrics, recentErrors, alertRules] = await Promise.all([
    getHealthMetrics(serviceClient, 24),
    getRecentErrors(serviceClient, 20),
    getAlertRules(serviceClient),
  ]);

  // Evaluate alerts in the background — don't block response
  evaluateAlerts(metrics, alertRules).catch(() => {});

  return {
    healthCheck: null, // Live health check is on-demand via triggerHealthCheckFn
    metrics,
    alertRules,
    recentErrors,
  };
}

/**
 * Triggers the health-check Edge Function and returns results.
 */
export async function triggerHealthCheckHandler(): Promise<HealthCheckResult> {
  await requireAdminOrThrow();

  const serviceClient = getSupabaseServer();

  const { data, error } = await serviceClient.functions.invoke("health-check", {
    body: {},
  });

  if (error) {
    throw new Response(
      JSON.stringify({
        data: null,
        error: { code: "HEALTH.CHECK_FAILED", message: error.message },
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  // The Edge Function returns { data: HealthCheckResult, error: null }
  return (data as { data: HealthCheckResult }).data;
}
