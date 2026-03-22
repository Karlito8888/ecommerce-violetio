/**
 * @module AdminHealthPage
 *
 * Admin route for platform health monitoring and error tracking.
 *
 * Auth: requires admin role (redirects to "/" if not authenticated).
 * SSR: initial health data loaded server-side.
 *
 * Displays service status (Supabase, Violet, Stripe), error metrics,
 * top error types bar chart, recent error log, and alert rule configuration.
 *
 * Accessibility features:
 * - `scope="col"` on table headers for screen reader cell-header association (WCAG 1.3.1)
 * - `aria-label` on status dots for color-blind accessibility
 * - `page-wrap` for consistent layout
 */

import { useState } from "react";
import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { buildPageMeta } from "@ecommerce/shared";
import type {
  PlatformHealthData,
  HealthCheckResult,
  ServiceStatus,
  AlertRule,
  RecentError,
  ErrorTypeCount,
} from "@ecommerce/shared";
import { getAdminUserFn } from "#/server/adminAuth";
import { getAdminHealthFn, triggerHealthCheckFn } from "#/server/getAdminHealth";

const SITE_URL = process.env.SITE_URL ?? "http://localhost:3000";

export const Route = createFileRoute("/admin/health")({
  beforeLoad: async () => {
    const adminUser = await getAdminUserFn();
    if (!adminUser) {
      throw redirect({ to: "/" });
    }
  },
  loader: async () => {
    return getAdminHealthFn();
  },
  head: () => ({
    meta: buildPageMeta({
      title: "Platform Health | Maison Émile",
      description: "Platform health monitoring and error tracking.",
      url: "/admin/health",
      siteUrl: SITE_URL,
      noindex: true,
    }),
  }),
  component: AdminHealthPage,
});

// ── Sub-components ───────────────────────────────────────────────────────────

function StatusDot({ status }: { status: ServiceStatus["status"] }) {
  const modifier =
    status === "up"
      ? "admin-health__dot--up"
      : status === "down"
        ? "admin-health__dot--down"
        : "admin-health__dot--unknown";
  return <span className={`admin-health__dot ${modifier}`} aria-label={status} />;
}

function ServiceCard({ name, service }: { name: string; service: ServiceStatus }) {
  return (
    <div className="admin-health__service-card">
      <StatusDot status={service.status} />
      <div className="admin-health__service-info">
        <span className="admin-health__service-name">{name}</span>
        {service.latency_ms != null && (
          <span className="admin-health__service-latency">{service.latency_ms}ms</span>
        )}
        {service.error && <span className="admin-health__service-error">{service.error}</span>}
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  severity,
}: {
  label: string;
  value: string | number;
  severity: "ok" | "warning" | "critical";
}) {
  return (
    <div className={`admin-health__metric admin-health__metric--${severity}`}>
      <span className="admin-health__metric-value">{value}</span>
      <span className="admin-health__metric-label">{label}</span>
    </div>
  );
}

function webhookSeverity(rate: number): "ok" | "warning" | "critical" {
  if (rate >= 95) return "ok";
  if (rate >= 80) return "warning";
  return "critical";
}

function errorRateSeverity(rate: number): "ok" | "warning" | "critical" {
  if (rate <= 1) return "ok";
  if (rate <= 5) return "warning";
  return "critical";
}

function TopErrorTypes({ errors }: { errors: ErrorTypeCount[] }) {
  if (errors.length === 0) {
    return <p className="admin-health__empty">No errors in time window.</p>;
  }
  const maxCount = Math.max(...errors.map((e) => e.count));
  return (
    <div className="admin-health__error-bars">
      {errors.map((entry) => (
        <div key={entry.error_type} className="admin-health__error-bar-row">
          <span className="admin-health__error-bar-label">{entry.error_type}</span>
          <div className="admin-health__error-bar-track">
            <div
              className="admin-health__error-bar-fill"
              style={{ width: `${(entry.count / maxCount) * 100}%` }}
            />
          </div>
          <span className="admin-health__error-bar-count">{entry.count}</span>
        </div>
      ))}
    </div>
  );
}

/** Displays recent platform errors in a table with timestamp, source, type, and message. */
function RecentErrorsTable({ errors }: { errors: RecentError[] }) {
  if (errors.length === 0) {
    return <p className="admin-health__empty">No recent errors.</p>;
  }
  return (
    <table className="admin-health__table">
      {/* Table uses scope="col" on headers for screen reader cell-header association (WCAG 1.3.1) */}
      <thead>
        <tr>
          <th scope="col">Time</th>
          <th scope="col">Source</th>
          <th scope="col">Type</th>
          <th scope="col">Message</th>
        </tr>
      </thead>
      <tbody>
        {errors.map((err) => (
          <tr key={err.id}>
            <td>{new Date(err.createdAt).toLocaleString()}</td>
            <td>{err.source}</td>
            <td className="admin-health__error-type">{err.errorType}</td>
            <td className="admin-health__error-msg">{err.message}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Displays configured alert rules with their thresholds, windows, and trigger history. */
function AlertRulesTable({ rules }: { rules: AlertRule[] }) {
  return (
    <table className="admin-health__table">
      {/* Table uses scope="col" on headers for screen reader cell-header association (WCAG 1.3.1) */}
      <thead>
        <tr>
          <th scope="col">Rule</th>
          <th scope="col">Threshold</th>
          <th scope="col">Window</th>
          <th scope="col">Enabled</th>
          <th scope="col">Last Triggered</th>
        </tr>
      </thead>
      <tbody>
        {rules.map((rule) => (
          <tr key={rule.id}>
            <td>{rule.ruleName.replace(/_/g, " ")}</td>
            <td>{rule.thresholdValue}</td>
            <td>{rule.timeWindowMinutes > 0 ? `${rule.timeWindowMinutes} min` : "—"}</td>
            <td>{rule.enabled ? "Yes" : "No"}</td>
            <td>
              {rule.lastTriggeredAt ? new Date(rule.lastTriggeredAt).toLocaleString() : "Never"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

function AdminHealthPage() {
  const initialData = Route.useLoaderData() as PlatformHealthData;
  const [healthData, setHealthData] = useState<PlatformHealthData>(initialData);
  const [healthCheck, setHealthCheck] = useState<HealthCheckResult | null>(initialData.healthCheck);
  const [checkingHealth, setCheckingHealth] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRunHealthCheck() {
    setCheckingHealth(true);
    setError(null);
    try {
      const result = await triggerHealthCheckFn();
      setHealthCheck(result);
    } catch {
      setError("Health check failed. Check server logs.");
    } finally {
      setCheckingHealth(false);
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    setError(null);
    try {
      const result = await getAdminHealthFn();
      setHealthData(result);
    } catch {
      setError("Failed to refresh health data.");
    } finally {
      setRefreshing(false);
    }
  }

  const { metrics, alertRules, recentErrors } = healthData;

  return (
    // {/* page-wrap ensures consistent max-width and horizontal padding across all pages */}
    <div className="page-wrap admin-health">
      <Link to="/admin" className="admin-health__back">
        &larr; Back to Dashboard
      </Link>

      <div className="admin-health__header">
        <h1 className="admin-health__title">Platform Health</h1>
        <div className="admin-health__actions">
          <button className="admin-health__btn" onClick={handleRefresh} disabled={refreshing}>
            {refreshing ? "Refreshing…" : "Refresh Metrics"}
          </button>
          <button
            className="admin-health__btn admin-health__btn--primary"
            onClick={handleRunHealthCheck}
            disabled={checkingHealth}
          >
            {checkingHealth ? "Checking…" : "Run Health Check"}
          </button>
        </div>
      </div>

      {error && <div className="admin-health__error-banner">{error}</div>}

      {/* Service Status Cards */}
      {healthCheck && (
        <section className="admin-health__section">
          <h2 className="admin-health__section-title">
            Service Status
            <span
              className={`admin-health__overall admin-health__overall--${healthCheck.overall_status}`}
            >
              {healthCheck.overall_status}
            </span>
          </h2>
          <div className="admin-health__status-grid">
            <ServiceCard name="Supabase" service={healthCheck.services.supabase} />
            <ServiceCard name="Violet.io" service={healthCheck.services.violet} />
            <ServiceCard name="Stripe" service={healthCheck.services.stripe} />
          </div>
          <p className="admin-health__checked-at">
            Last checked: {new Date(healthCheck.checked_at).toLocaleString()}
          </p>
        </section>
      )}

      {/* Key Metrics */}
      <section className="admin-health__section">
        <h2 className="admin-health__section-title">Key Metrics (Last 24h)</h2>
        <div className="admin-health__metrics-row">
          <MetricCard
            label="Errors"
            value={metrics.errorCount}
            severity={errorRateSeverity(metrics.errorRatePerHour)}
          />
          <MetricCard
            label="Error Rate / hr"
            value={metrics.errorRatePerHour.toFixed(1)}
            severity={errorRateSeverity(metrics.errorRatePerHour)}
          />
          <MetricCard
            label="Webhook Success"
            value={`${metrics.webhookSuccessRate.toFixed(1)}%`}
            severity={webhookSeverity(metrics.webhookSuccessRate)}
          />
          <MetricCard
            label="Consec. Failures"
            value={metrics.consecutiveWebhookFailures}
            severity={metrics.consecutiveWebhookFailures >= 3 ? "critical" : "ok"}
          />
        </div>
      </section>

      {/* Two columns: Error types + Recent errors */}
      <div className="admin-health__columns">
        <section className="admin-health__section admin-health__column">
          <h2 className="admin-health__section-title">Top Error Types</h2>
          <TopErrorTypes errors={metrics.topErrorTypes} />
        </section>

        <section className="admin-health__section admin-health__column">
          <h2 className="admin-health__section-title">Recent Errors</h2>
          <RecentErrorsTable errors={recentErrors} />
        </section>
      </div>

      {/* Alert Rules */}
      <section className="admin-health__section">
        <h2 className="admin-health__section-title">Alert Rules</h2>
        <AlertRulesTable rules={alertRules} />
      </section>
    </div>
  );
}
