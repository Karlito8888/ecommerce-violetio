/**
 * @module DashboardMetrics
 *
 * Displays key business KPIs (orders, revenue, commission, users, conversion, AI usage)
 * as a responsive card grid. Used on the admin dashboard index page.
 *
 * Revenue and commission values are formatted from cents via `formatPrice` to ensure
 * consistent currency display across the platform.
 */

import { formatPrice } from "@ecommerce/shared";
import type { DashboardMetrics as DashboardMetricsType } from "@ecommerce/shared";

interface DashboardMetricsProps {
  metrics: DashboardMetricsType;
}

interface MetricCard {
  label: string;
  value: string;
  highlight?: boolean;
}

/** Renders a grid of KPI cards summarizing platform performance for the selected time range. */
export default function DashboardMetrics({ metrics }: DashboardMetricsProps) {
  const cards: MetricCard[] = [
    {
      label: "Total Orders",
      value: metrics.totalOrders.toLocaleString(),
    },
    {
      label: "Gross Revenue",
      value: formatPrice(metrics.grossRevenueCents),
      highlight: true,
    },
    {
      label: "Commission Earned",
      value: formatPrice(metrics.commissionEstimateCents),
      highlight: true,
    },
    {
      label: "Active Users",
      value: metrics.activeUsers.toLocaleString(),
    },
    {
      label: "Conversion Rate",
      value: `${metrics.conversionRate.toFixed(1)}%`,
    },
    {
      label: "AI Search Usage",
      value: `${metrics.aiSearchUsagePct.toFixed(1)}%`,
    },
  ];

  return (
    <div className="dashboard-metrics">
      {cards.map((card) => (
        <div key={card.label} className="dashboard-metrics__card">
          <span className="dashboard-metrics__label">{card.label}</span>
          <span
            className={`dashboard-metrics__value${card.highlight ? " dashboard-metrics__value--highlight" : ""}`}
          >
            {card.value}
          </span>
        </div>
      ))}
    </div>
  );
}
