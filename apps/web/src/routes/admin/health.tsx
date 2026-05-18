/**
 * @module AdminHealthPage
 *
 * Admin route for platform health monitoring and error tracking.
 *
 * Auth: requires admin role (verified via Convex Auth).
 * Data: loaded via Convex reactive queries.
 *
 * Error handling: AdminErrorBoundary catches Convex query errors
 * (e.g. assertAdmin failure). useQuery never returns Error objects.
 *
 * Phase 9: migrated from Supabase server functions to Convex queries.
 * Post-review fixes: ErrorBoundary, useNavigate, Convex-based health check.
 */

import { useState, useEffect } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "#convex/_generated/api";
import { buildPageMeta } from "@ecommerce/shared";
import type { ServiceStatus, AlertRule, RecentError, ErrorTypeCount } from "@ecommerce/shared";
import { useConvexAuth } from "@convex-dev/auth/react";
import { AdminErrorBoundary } from "#/components/admin/ErrorBoundary";

const SITE_URL = process.env.SITE_URL ?? "http://localhost:3000";

export const Route = createFileRoute("/admin/health")({
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

function RecentErrorsTable({ errors }: { errors: RecentError[] }) {
  if (errors.length === 0) {
    return <p className="admin-health__empty">No recent errors.</p>;
  }
  return (
    <table className="admin-health__table">
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
          <tr key={String(err.id)}>
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

function AlertRulesTable({ rules }: { rules: AlertRule[] }) {
  return (
    <table className="admin-health__table">
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
          <tr key={rule.id ? String(rule.id) : rule.ruleName}>
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
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const navigate = useNavigate();

  // Health data — reactive Convex query
  const healthData = useQuery(api.admin.queries.getHealthData);

  // Health check — on-demand Convex query (triggered by button)
  const [showHealthCheck, setShowHealthCheck] = useState(false);
  const healthCheckResult = useQuery(
    api.health.queries.runHealthCheck,
    showHealthCheck ? {} : "skip",
  );

  // Auth redirect
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
  if (healthData === undefined) {
    return (
      <div className="page-wrap">
        <p>Loading health data…</p>
      </div>
    );
  }

  // Convex queries throw on error — caught by AdminErrorBoundary wrapper
  if (healthData === null) {
    return (
      <div className="page-wrap">
        <p>No health data available.</p>
        <Link to="/">Back to home</Link>
      </div>
    );
  }

  const { metrics, alertRules, recentErrors } = healthData;

  return (
    <AdminErrorBoundary>
      <div className="page-wrap admin-health">
        <Link to="/admin" className="admin-health__back">
          &larr; Back to Dashboard
        </Link>

        <div className="admin-health__header">
          <h1 className="admin-health__title">Platform Health</h1>
          <div className="admin-health__actions">
            <button className="admin-health__btn" onClick={() => window.location.reload()}>
              Refresh Metrics
            </button>
            <button
              className="admin-health__btn admin-health__btn--primary"
              onClick={() => setShowHealthCheck(true)}
              disabled={showHealthCheck && healthCheckResult === undefined}
            >
              {showHealthCheck && healthCheckResult === undefined
                ? "Checking…"
                : "Run Health Check"}
            </button>
          </div>
        </div>

        {/* Service Status Cards — populated by Convex runHealthCheck query */}
        {healthCheckResult && (
          <section className="admin-health__section">
            <h2 className="admin-health__section-title">
              Service Status
              <span
                className={`admin-health__overall admin-health__overall--${healthCheckResult.overall_status}`}
              >
                {healthCheckResult.overall_status}
              </span>
            </h2>
            <div className="admin-health__status-grid">
              {Object.entries(healthCheckResult.services).map(([name, service]) => (
                <ServiceCard
                  key={name}
                  name={name.charAt(0).toUpperCase() + name.slice(1)}
                  service={service as ServiceStatus}
                />
              ))}
            </div>
            <p className="admin-health__checked-at">
              Last checked: {new Date(healthCheckResult.checked_at).toLocaleString()}
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
          <AlertRulesTable rules={alertRules as AlertRule[]} />
        </section>
      </div>
    </AdminErrorBoundary>
  );
}
