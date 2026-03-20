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
