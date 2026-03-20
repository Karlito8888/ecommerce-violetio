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
