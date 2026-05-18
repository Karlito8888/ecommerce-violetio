/**
 * @module AdminDashboardPage
 *
 * Admin dashboard — analytics overview with commission breakdown.
 *
 * Auth: requires admin role (verified via Convex Auth + assertAdmin).
 * Data: loaded via Convex reactive queries (no server functions).
 *
 * Features:
 * - KPI cards (orders, revenue, commission, users, conversion)
 * - Per-merchant commission table with totals
 * - Time range selector (today, 7d, 30d)
 * - Distributions lookup per order
 * - Reactive refresh — data updates automatically when underlying data changes
 *
 * Phase 9: migrated from Supabase server functions to Convex queries.
 */

import { useState, useEffect, useMemo } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "#convex/_generated/api";
import { buildPageMeta } from "@ecommerce/shared";
import type { TimeRange, TimeRangeParams } from "@ecommerce/shared";
import { useConvexAuth } from "@convex-dev/auth/react";
import { AdminErrorBoundary } from "#/components/admin/ErrorBoundary";
import DashboardMetrics from "#/components/admin/DashboardMetrics";
import CommissionTable from "#/components/admin/CommissionTable";
import TimeRangeSelector from "#/components/admin/TimeRangeSelector";
import DistributionsTable from "#/components/admin/DistributionsTable";

const SITE_URL = process.env.SITE_URL ?? "http://localhost:3000";

export const Route = createFileRoute("/admin/")({
  beforeLoad: async () => {
    // Client-side guard — Convex Auth stores tokens in localStorage
    // (no server-side cookie access). Full admin check happens in Convex queries.
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
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const navigate = useNavigate();
  const [selectedRange, setSelectedRange] = useState<TimeRange>("30d");
  const [distributionsOrderId, setDistributionsOrderId] = useState<string | null>(null);

  // Stabilize `now` — only recalculate when range changes.
  // Raw Date.now() in useQuery args creates a new value every render,
  // causing Convex React to re-subscribe on every render (JSON.stringify args comparison).
  const now = useMemo(() => Date.now(), [selectedRange]);

  // Dashboard data — reactive Convex query (admin-only, assertAdmin in handler)
  const dashboardData = useQuery(api.admin.queries.getDashboardData, {
    range: selectedRange,
    now,
  });

  // Distributions for a specific order
  const distributions = useQuery(
    api.admin.queries.getOrderDistributions,
    distributionsOrderId ? { violetOrderId: distributionsOrderId } : "skip",
  );

  // Auth redirect — useEffect avoids side effects during render
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate({ to: "/" });
    }
  }, [authLoading, isAuthenticated, navigate]);

  if (authLoading || !isAuthenticated) {
    return (
      <div className="page-wrap">
        <p>Loading…</p>
      </div>
    );
  }

  if (dashboardData === undefined) {
    return (
      <div className="page-wrap">
        <p>Loading dashboard…</p>
      </div>
    );
  }

  // Convex queries throw on error (e.g. assertAdmin failure) — caught by AdminErrorBoundary
  // useQuery never returns an Error object, so `instanceof Error` is dead code.
  if (dashboardData === null) {
    return (
      <div className="page-wrap">
        <p>No data available.</p>
        <Link to="/">Back to home</Link>
      </div>
    );
  }

  const { metrics, commission } = dashboardData;

  function handleRangeChange(params: TimeRangeParams) {
    setSelectedRange(params.range);
  }

  function handleSyncDistributions(violetOrderId: string) {
    setDistributionsOrderId(violetOrderId);
  }

  return (
    <AdminErrorBoundary>
      <div className="page-wrap admin-dashboard">
        <header className="admin-dashboard__header">
          <h1 className="admin-dashboard__title">Dashboard</h1>
          <TimeRangeSelector value={selectedRange} onChange={handleRangeChange} />
        </header>

        <section className="admin-dashboard__metrics">
          <DashboardMetrics metrics={metrics} />
        </section>

        <section className="admin-dashboard__commission">
          <h2 className="admin-dashboard__section-title">Commission Breakdown</h2>
          <CommissionTable data={commission.map((c) => ({ ...c, merchantName: c.name }))} />
        </section>

        <section className="admin-dashboard__distributions">
          <h2 className="admin-dashboard__section-title">Distributions</h2>
          <div className="admin-dashboard__dist-input">
            <label htmlFor="dist-order-id">Check distributions for Violet order ID:</label>
            <input
              id="dist-order-id"
              type="text"
              placeholder="e.g. 123456"
              onKeyDown={(e) => {
                if (e.key === "Enter" && e.currentTarget.value) {
                  handleSyncDistributions(e.currentTarget.value);
                }
              }}
            />
          </div>
          {distributionsOrderId && distributions && (
            <DistributionsTable
              distributions={distributions.map((d) => ({
                id: d._id,
                violet_order_id: d.violetOrderId,
                violet_bag_id: d.violetBagId ?? "",
                order_bag_id: "",
                type: d.type as import("@ecommerce/shared").DistributionType,
                status: (d.status ?? "UNKNOWN") as import("@ecommerce/shared").DistributionStatus,
                channel_amount_cents: d.channelAmount ?? d.amount,
                stripe_fee_cents: d.stripeFee ?? 0,
                merchant_amount_cents: d.merchantAmount ?? 0,
                subtotal_cents: d.subtotal ?? 0,
                synced_at: new Date(d._creationTime).toISOString(),
              }))}
              violetOrderId={distributionsOrderId}
              onSync={handleSyncDistributions}
              isSyncing={false}
            />
          )}
        </section>

        <nav className="admin-dashboard__nav">
          <Link to="/admin/health" className="admin-dashboard__nav-link">
            Platform Health
          </Link>
          <Link to="/admin/support" className="admin-dashboard__nav-link">
            Support Inquiries
          </Link>
        </nav>

        <footer className="admin-dashboard__footer">
          <p className="admin-dashboard__refresh-info">
            Data for period: {new Date(metrics.periodStart).toLocaleDateString()} –{" "}
            {new Date(metrics.periodEnd).toLocaleDateString()}
          </p>
        </footer>
      </div>
    </AdminErrorBoundary>
  );
}
