/** Dashboard KPI metrics for a given time period. */
export interface DashboardMetrics {
  totalOrders: number;
  grossRevenueCents: number;
  commissionEstimateCents: number;
  activeUsers: number;
  totalVisitors: number;
  conversionRate: number;
  aiSearchUsagePct: number;
  periodStart: string;
  periodEnd: string;
}

/** Per-merchant commission breakdown from materialized view. */
export interface CommissionSummary {
  merchantName: string;
  bagCount: number;
  grossSubtotalCents: number;
  commissionCents: number;
  commissionRate: number;
}

/** Time range filter options for the dashboard. */
export type TimeRange = "today" | "7d" | "30d" | "custom";

/** Parameters for time-filtered dashboard queries. */
export interface TimeRangeParams {
  range: TimeRange;
  customStart?: string;
  customEnd?: string;
}

/** Combined dashboard data returned by server function. */
export interface AdminDashboardData {
  metrics: DashboardMetrics;
  commission: CommissionSummary[];
}

/**
 * Input for setting a merchant's commission rate.
 *
 * @see https://docs.violet.io/api-reference/apps/commission-rates/set-merchant-app-commission-rate
 */
export interface SetCommissionRateInput {
  /** Violet Merchant ID */
  merchantId: string;
  /** Commission rate (0–50 for channels, 0–100 for merchants) */
  commissionRate: number;
  /** Lock the rate so the merchant cannot change it */
  commissionLocked: boolean;
}

/**
 * Response from Violet's set commission rate API.
 * Returns the updated App Install record.
 *
 * @see https://docs.violet.io/api-reference/apps/commission-rates/set-merchant-app-commission-rate
 */
export interface AppInstall {
  /** App Install ID */
  id: string;
  /** Violet App ID */
  appId: string;
  /** Violet Merchant ID */
  merchantId: string;
  /** Install scope */
  scope: string;
  /** Install status (e.g., "REQUESTED") */
  status: string;
  /** Install source (e.g., "DIRECT") */
  installSource: string;
  /** Current commission rate */
  commissionRate: number;
  /** Whether the rate is locked */
  commissionLocked: boolean;
  /** ISO-8601 creation date */
  dateCreated: string;
  /** ISO-8601 last modified date */
  dateLastModified: string;
}
