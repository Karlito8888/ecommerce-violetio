import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  HealthMetrics,
  RecentError,
  AlertRule,
  ErrorTypeCount,
} from "../types/health.types.js";

/** Map fn_health_metrics RPC result to HealthMetrics. */
function mapMetricsRow(row: Record<string, unknown>): HealthMetrics {
  return {
    errorCount: Number(row.error_count ?? 0),
    errorRatePerHour: Number(row.error_rate_per_hour ?? 0),
    webhookTotal: Number(row.webhook_total ?? 0),
    webhookSuccess: Number(row.webhook_success ?? 0),
    webhookFailed: Number(row.webhook_failed ?? 0),
    webhookSuccessRate: Number(row.webhook_success_rate ?? 100),
    topErrorTypes: (row.top_error_types as ErrorTypeCount[]) ?? [],
    consecutiveWebhookFailures: Number(row.consecutive_webhook_failures ?? 0),
  };
}

/** Fetch aggregated health metrics via fn_health_metrics RPC. */
export async function getHealthMetrics(
  client: SupabaseClient,
  hours: number = 24,
): Promise<HealthMetrics> {
  const { data, error } = await client.rpc("fn_health_metrics", { p_hours: hours });

  if (error) throw error;

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    return {
      errorCount: 0,
      errorRatePerHour: 0,
      webhookTotal: 0,
      webhookSuccess: 0,
      webhookFailed: 0,
      webhookSuccessRate: 100,
      topErrorTypes: [],
      consecutiveWebhookFailures: 0,
    };
  }

  return mapMetricsRow(row as Record<string, unknown>);
}

/** Fetch recent error log entries. */
export async function getRecentErrors(
  client: SupabaseClient,
  limit: number = 20,
): Promise<RecentError[]> {
  const { data, error } = await client
    .from("error_logs")
    .select("id, created_at, source, error_type, message")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id as string,
    createdAt: row.created_at as string,
    source: row.source as string,
    errorType: row.error_type as string,
    message: row.message as string,
  }));
}

/** Map DB row (snake_case) to AlertRule (camelCase). */
function mapAlertRow(row: Record<string, unknown>): AlertRule {
  return {
    id: row.id as string,
    ruleName: row.rule_name as string,
    thresholdValue: row.threshold_value as number,
    timeWindowMinutes: row.time_window_minutes as number,
    enabled: row.enabled as boolean,
    lastTriggeredAt: (row.last_triggered_at as string) ?? null,
  };
}

/** Fetch all alert rules. */
export async function getAlertRules(client: SupabaseClient): Promise<AlertRule[]> {
  const { data, error } = await client.from("alert_rules").select("*").order("rule_name");

  if (error) throw error;
  return (data ?? []).map(mapAlertRow);
}
