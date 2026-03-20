import type { SupabaseClient } from "@supabase/supabase-js";

import type { CommissionSummary, DashboardMetrics, TimeRangeParams } from "../types/admin.types.js";

/** Resolve TimeRangeParams to ISO date strings for SQL function. */
export function resolveTimeRange(params: TimeRangeParams): {
  start: string;
  end: string;
} {
  const now = new Date();
  const end = now.toISOString();

  switch (params.range) {
    case "today": {
      const startOfDay = new Date(now);
      startOfDay.setHours(0, 0, 0, 0);
      return { start: startOfDay.toISOString(), end };
    }
    case "7d": {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      return { start: d.toISOString(), end };
    }
    case "30d": {
      const d = new Date(now);
      d.setDate(d.getDate() - 30);
      return { start: d.toISOString(), end };
    }
    case "custom": {
      if (!params.customStart || !params.customEnd) {
        throw new Error("Custom range requires customStart and customEnd");
      }
      return { start: params.customStart, end: params.customEnd };
    }
  }
}

/** Fetch dashboard KPIs for a given time range via SQL function. */
export async function getDashboardMetrics(
  client: SupabaseClient,
  params: TimeRangeParams,
): Promise<DashboardMetrics> {
  const { start, end } = resolveTimeRange(params);

  const { data, error } = await client.rpc("fn_dashboard_metrics_by_range", {
    p_start: start,
    p_end: end,
  });

  if (error) throw error;

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    return {
      totalOrders: 0,
      grossRevenueCents: 0,
      commissionEstimateCents: 0,
      activeUsers: 0,
      totalVisitors: 0,
      conversionRate: 0,
      aiSearchUsagePct: 0,
      periodStart: start,
      periodEnd: end,
    };
  }

  return {
    totalOrders: Number(row.total_orders) || 0,
    grossRevenueCents: Number(row.gross_revenue_cents) || 0,
    commissionEstimateCents: Number(row.commission_estimate_cents) || 0,
    activeUsers: Number(row.active_users) || 0,
    totalVisitors: Number(row.total_visitors) || 0,
    conversionRate: Number(row.conversion_rate) || 0,
    aiSearchUsagePct: Number(row.ai_search_usage_pct) || 0,
    periodStart: start,
    periodEnd: end,
  };
}

/** Fetch per-merchant commission breakdown from materialized view. */
export async function getCommissionSummary(client: SupabaseClient): Promise<CommissionSummary[]> {
  const { data, error } = await client
    .from("mv_commission_summary")
    .select("*")
    .order("commission_estimate_cents", { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    merchantName: row.merchant_name,
    bagCount: Number(row.bag_count) || 0,
    grossSubtotalCents: Number(row.gross_subtotal_cents) || 0,
    commissionCents: Number(row.commission_estimate_cents) || 0,
    commissionRate: Number(row.commission_rate_pct) || 10,
  }));
}

/** Refresh both materialized views. Requires service role client. */
export async function refreshDashboardViews(client: SupabaseClient): Promise<void> {
  const { error } = await client.rpc("refresh_dashboard_views");
  if (error) throw error;
}
