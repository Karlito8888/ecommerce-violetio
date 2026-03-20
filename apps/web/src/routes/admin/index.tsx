import { useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { buildPageMeta } from "@ecommerce/shared";
import type { TimeRange, TimeRangeParams, AdminDashboardData } from "@ecommerce/shared";
import { getAdminUserFn } from "#/server/adminAuth";
import { getAdminDashboardFn } from "#/server/getAdminDashboard";
import DashboardMetrics from "#/components/admin/DashboardMetrics";
import CommissionTable from "#/components/admin/CommissionTable";
import TimeRangeSelector from "#/components/admin/TimeRangeSelector";

const SITE_URL = process.env.SITE_URL ?? "http://localhost:3000";

export const Route = createFileRoute("/admin/")({
  beforeLoad: async () => {
    const adminUser = await getAdminUserFn();
    if (!adminUser) {
      throw redirect({ to: "/" });
    }
  },
  loader: async () => {
    return getAdminDashboardFn({ data: { params: { range: "30d" } } });
  },
  head: () => ({
    meta: buildPageMeta({
      title: "Admin Dashboard | Maison Émile",
      description: "Platform analytics and commission tracking dashboard.",
      url: "/admin",
      siteUrl: SITE_URL,
      noindex: true,
    }),
  }),
  component: AdminDashboardPage,
});

function AdminDashboardPage() {
  const initialData = Route.useLoaderData() as AdminDashboardData;
  const [dashboardData, setDashboardData] = useState<AdminDashboardData>(initialData);
  const [selectedRange, setSelectedRange] = useState<TimeRange>("30d");
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRangeChange(params: TimeRangeParams) {
    setSelectedRange(params.range);
    setLoading(true);
    try {
      setError(null);
      const result = await getAdminDashboardFn({ data: { params } });
      setDashboardData(result);
    } catch {
      setError("Failed to load dashboard data. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    try {
      setError(null);
      const result = await getAdminDashboardFn({
        data: { params: { range: selectedRange } },
      });
      setDashboardData(result);
    } catch {
      setError("Failed to refresh dashboard data. Please try again.");
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="page-wrap admin-dashboard">
      <header className="admin-dashboard__header">
        <h1 className="admin-dashboard__title">Dashboard</h1>
        <TimeRangeSelector value={selectedRange} onChange={handleRangeChange} />
      </header>

      {error && (
        <div className="admin-dashboard__error" role="alert">
          {error}
        </div>
      )}

      <section
        className={`admin-dashboard__metrics${loading ? " admin-dashboard__metrics--loading" : ""}`}
      >
        <DashboardMetrics metrics={dashboardData.metrics} />
      </section>

      <section className="admin-dashboard__commission">
        <h2 className="admin-dashboard__section-title">Commission Breakdown</h2>
        <CommissionTable data={dashboardData.commission} />
      </section>

      <footer className="admin-dashboard__footer">
        <p className="admin-dashboard__refresh-info">
          Data for period: {new Date(dashboardData.metrics.periodStart).toLocaleDateString()} –{" "}
          {new Date(dashboardData.metrics.periodEnd).toLocaleDateString()}
        </p>
        <button
          type="button"
          className="admin-dashboard__refresh-button"
          onClick={handleRefresh}
          disabled={refreshing}
        >
          {refreshing ? "Refreshing…" : "Refresh Data"}
        </button>
      </footer>
    </div>
  );
}
