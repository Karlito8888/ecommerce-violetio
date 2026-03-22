/**
 * Health monitoring client — queries platform health metrics, error logs,
 * and alert rules from Supabase. Used by the admin health dashboard.
 *
 * All functions require an authenticated admin Supabase client.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  HealthMetrics,
  RecentError,
  AlertRule,
  ErrorTypeCount,
} from "../types/health.types.js";

/**
 * Raw row shape returned by the fn_health_metrics RPC function.
 * Typed interface catches schema drift at compile time instead of
 * silently casting Record<string, unknown> with `as`.
 */
interface HealthMetricsRow {
  error_count: number;
  error_rate_per_hour: number;
  webhook_total: number;
  webhook_success: number;
  webhook_failed: number;
  webhook_success_rate: number;
  top_error_types: ErrorTypeCount[];
  consecutive_webhook_failures: number;
}

/**
 * Raw row shape from the `error_logs` table.
 * Matches the columns selected in getRecentErrors.
 */
interface ErrorLogRow {
  id: string;
  created_at: string;
  source: string;
  error_type: string;
  message: string;
  stack_trace: string | null;
  context: Record<string, string | number | boolean | null> | null;
}

/**
 * Raw row shape from the `alert_rules` table.
 * Matches the Supabase PostgREST response for select("*").
 */
interface AlertRuleRow {
  id: string;
  rule_name: string;
  description: string;
  threshold_value: number;
  time_window_minutes: number;
  enabled: boolean;
  last_triggered_at: string | null;
}

/**
 * Map fn_health_metrics RPC result to the HealthMetrics domain shape.
 *
 * @param row - Raw RPC response row
 * @returns Mapped HealthMetrics with camelCase keys
 */
function mapMetricsRow(row: HealthMetricsRow): HealthMetrics {
  return {
    errorCount: Number(row.error_count ?? 0),
    errorRatePerHour: Number(row.error_rate_per_hour ?? 0),
    webhookTotal: Number(row.webhook_total ?? 0),
    webhookSuccess: Number(row.webhook_success ?? 0),
    webhookFailed: Number(row.webhook_failed ?? 0),
    webhookSuccessRate: Number(row.webhook_success_rate ?? 100),
    topErrorTypes: row.top_error_types ?? [],
    consecutiveWebhookFailures: Number(row.consecutive_webhook_failures ?? 0),
  };
}

/**
 * Fetch aggregated health metrics via fn_health_metrics RPC.
 *
 * @param client - Admin-authenticated Supabase client
 * @param hours - Lookback window in hours (default: 24)
 * @returns Aggregated health metrics for the given time window
 */
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

  return mapMetricsRow(row as HealthMetricsRow);
}

/**
 * Fetch recent error log entries for the admin error table.
 *
 * @param client - Admin-authenticated Supabase client
 * @param limit - Maximum number of errors to return (default: 20)
 * @returns Array of recent errors, newest first
 */
export async function getRecentErrors(
  client: SupabaseClient,
  limit: number = 20,
): Promise<RecentError[]> {
  const { data, error } = await client
    .from("error_logs")
    .select("id, created_at, source, error_type, message, stack_trace, context")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;

  return (data ?? []).map((row: ErrorLogRow) => ({
    id: row.id,
    createdAt: row.created_at,
    source: row.source,
    errorType: row.error_type,
    message: row.message,
    stackTrace: row.stack_trace || undefined,
    context: row.context || undefined,
  }));
}

/**
 * Map a raw alert_rules DB row (snake_case) to AlertRule (camelCase).
 *
 * @param row - Raw PostgREST row from alert_rules table
 * @returns Mapped AlertRule domain object
 */
function mapAlertRow(row: AlertRuleRow): AlertRule {
  return {
    id: row.id,
    ruleName: row.rule_name,
    description: row.description,
    thresholdValue: row.threshold_value,
    timeWindowMinutes: row.time_window_minutes,
    enabled: row.enabled,
    lastTriggeredAt: row.last_triggered_at ?? null,
  };
}

/**
 * Fetch all alert rules, ordered alphabetically by rule name.
 *
 * @param client - Admin-authenticated Supabase client
 * @returns Array of all configured alert rules
 */
export async function getAlertRules(client: SupabaseClient): Promise<AlertRule[]> {
  const { data, error } = await client.from("alert_rules").select("*").order("rule_name");

  if (error) throw error;
  return (data ?? []).map(mapAlertRow);
}
