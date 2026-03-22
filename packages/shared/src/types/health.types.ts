/**
 * Health monitoring types — shapes for platform health checks, error logs,
 * and alert rule configuration. Maps to the `error_logs` and `alert_rules`
 * Supabase tables and the `fn_health_metrics` RPC function.
 */

/** Result of the health-check Edge Function. */
export interface HealthCheckResult {
  overall_status: "healthy" | "degraded" | "down";
  services: {
    supabase: ServiceStatus;
    violet: ServiceStatus;
    stripe: ServiceStatus;
  };
  checked_at: string;
}

/** Status of a single external service dependency. */
export interface ServiceStatus {
  status: "up" | "down" | "unknown";
  latency_ms: number | null;
  error?: string;
}

/** Aggregated health metrics from fn_health_metrics RPC. */
export interface HealthMetrics {
  errorCount: number;
  errorRatePerHour: number;
  webhookTotal: number;
  webhookSuccess: number;
  webhookFailed: number;
  webhookSuccessRate: number;
  topErrorTypes: ErrorTypeCount[];
  consecutiveWebhookFailures: number;
}

/** Error type breakdown returned by fn_health_metrics. */
export interface ErrorTypeCount {
  error_type: string;
  count: number;
}

/** Alert rule configuration from the `alert_rules` table. */
export interface AlertRule {
  id: string;
  ruleName: string;
  /** Human-readable description of what this alert rule monitors */
  description: string;
  thresholdValue: number;
  timeWindowMinutes: number;
  enabled: boolean;
  lastTriggeredAt: string | null;
}

/** Complete health page data aggregated from all sources. */
export interface PlatformHealthData {
  healthCheck: HealthCheckResult | null;
  metrics: HealthMetrics;
  alertRules: AlertRule[];
  recentErrors: RecentError[];
}

/** Recent error log entry for display, from the `error_logs` table. */
export interface RecentError {
  id: string;
  createdAt: string;
  source: string;
  errorType: string;
  message: string;
  /** Full stack trace for debugging — only fetched in detail views */
  stackTrace?: string;
  /**
   * Arbitrary context object (request params, user info, etc.).
   * Uses `Record<string, JsonSerializable>` pattern to stay compatible with
   * TanStack Start's server function serialization which rejects `unknown`.
   */
  context?: Record<string, string | number | boolean | null>;
}
