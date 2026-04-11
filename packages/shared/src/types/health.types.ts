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
  /**
   * Connection Health for merchants with issues (INCOMPLETE or NEEDS_ATTENTION).
   * Only non-COMPLETE merchants are included to reduce noise.
   * Undefined if the Violet API call failed or no merchants are connected.
   *
   * @see https://docs.violet.io/prism/violet-connect/guides/connection-health
   */
  merchants?: MerchantConnectionHealth[];
  checked_at: string;
}

/**
 * Connection Health summary for a single merchant from Violet's Operations API.
 *
 * @see https://docs.violet.io/api-reference/operations/connection/get-connection-health
 */
export interface MerchantConnectionHealth {
  merchant_id: number;
  merchant_name: string;
  /** Overall status across all sub-checks */
  overall_status: "COMPLETE" | "INCOMPLETE" | "NEEDS_ATTENTION" | "UNKNOWN";
  /** Detailed sub-check results (Connection, Scopes, Sync, etc.) */
  checks: ConnectionHealthCheck[];
}

/**
 * A single sub-check within a merchant's Connection Health report.
 *
 * Violet checks 7 areas per merchant: Connection, Scopes, Sync Status,
 * Invalid Products, Offers Published, Payout Account, Commission Rate.
 *
 * @see https://docs.violet.io/prism/violet-connect/guides/connection-health
 */
export interface ConnectionHealthCheck {
  /** Machine-readable check identifier */
  type: string;
  /** Human-readable label */
  label: string;
  /** Current state */
  status: "COMPLETE" | "INCOMPLETE" | "NEEDS_ATTENTION" | "UNKNOWN";
  /** Guidance message when status is not COMPLETE */
  message?: string;
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
