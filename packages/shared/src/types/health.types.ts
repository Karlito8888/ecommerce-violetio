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

export interface ServiceStatus {
  status: "up" | "down" | "unknown";
  latency_ms: number | null;
  error?: string;
}

/** Aggregated health metrics from fn_health_metrics. */
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

export interface ErrorTypeCount {
  error_type: string;
  count: number;
}

/** Alert rule configuration. */
export interface AlertRule {
  id: string;
  ruleName: string;
  thresholdValue: number;
  timeWindowMinutes: number;
  enabled: boolean;
  lastTriggeredAt: string | null;
}

/** Complete health page data. */
export interface PlatformHealthData {
  healthCheck: HealthCheckResult | null;
  metrics: HealthMetrics;
  alertRules: AlertRule[];
  recentErrors: RecentError[];
}

/** Recent error log entry for display. */
export interface RecentError {
  id: string;
  createdAt: string;
  source: string;
  errorType: string;
  message: string;
}
