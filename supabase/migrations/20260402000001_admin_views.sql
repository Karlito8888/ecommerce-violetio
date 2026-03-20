-- Story 8.3: Analytics & Commission Dashboard
-- Materialized views for pre-computed dashboard metrics + time-filtered function.
--
-- ## Materialized Views Strategy
-- mv_dashboard_metrics: global order/user aggregates (refreshed periodically)
-- mv_commission_summary: per-merchant commission estimates (refreshed periodically)
-- fn_dashboard_metrics_by_range: dynamic time-filtered queries (not materialized)
--
-- ## Refresh Strategy
-- REFRESH MATERIALIZED VIEW CONCURRENTLY requires a unique index.
-- Refresh can be triggered manually or via a scheduled Edge Function.
-- For MVP: manual refresh via admin dashboard "Refresh" button.
--
-- ## Commission Estimation
-- MVP uses a default 10% commission rate on bag subtotals.
-- Future: store per-merchant rates from Violet's commission_rate field.

-- ── Commission Estimation Helper ────────────────────────────────────────────
-- Returns estimated commission in cents for a given bag subtotal.
-- commission_rate_pct is the merchant's commission percentage (default 10%).
CREATE OR REPLACE FUNCTION public.estimate_commission(
  bag_subtotal_cents INTEGER,
  commission_rate_pct NUMERIC DEFAULT 10.0
) RETURNS INTEGER AS $$
BEGIN
  RETURN FLOOR(bag_subtotal_cents * commission_rate_pct / 100.0);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION public.estimate_commission(INTEGER, NUMERIC) IS
  'Estimate affiliate commission in cents. Default 10% of bag subtotal.';

-- ── Materialized View: Dashboard Metrics ────────────────────────────────────
-- Global aggregates across all non-canceled orders.
-- Refreshed periodically — not real-time.
CREATE MATERIALIZED VIEW public.mv_dashboard_metrics AS
SELECT
  COUNT(DISTINCT o.id) AS total_orders,
  COALESCE(SUM(o.total), 0) AS gross_revenue_cents,
  COALESCE(SUM(public.estimate_commission(ob.subtotal)), 0) AS commission_estimate_cents,
  COUNT(DISTINCT o.user_id) FILTER (WHERE o.user_id IS NOT NULL) AS registered_users_ordered,
  (SELECT COUNT(DISTINCT user_id) FROM public.user_events
   WHERE created_at > now() - interval '30 days') AS active_users_30d,
  (SELECT COUNT(DISTINCT user_id) FROM public.user_events
   WHERE created_at > now() - interval '7 days') AS active_users_7d,
  (SELECT COUNT(DISTINCT user_id) FROM public.user_events
   WHERE created_at > now() - interval '1 day') AS active_users_today,
  now() AS refreshed_at
FROM orders o
LEFT JOIN order_bags ob ON ob.order_id = o.id
WHERE o.status NOT IN ('CANCELED', 'REJECTED');

-- Unique index required for CONCURRENTLY refresh (single-row view, use constant)
CREATE UNIQUE INDEX idx_mv_dashboard_metrics_unique
  ON public.mv_dashboard_metrics (refreshed_at);

-- ── Materialized View: Commission Summary ───────────────────────────────────
-- Per-merchant commission breakdown for paid bags.
CREATE MATERIALIZED VIEW public.mv_commission_summary AS
SELECT
  ob.merchant_name,
  COUNT(DISTINCT ob.id) AS bag_count,
  COALESCE(SUM(ob.subtotal), 0) AS gross_subtotal_cents,
  COALESCE(SUM(public.estimate_commission(ob.subtotal)), 0) AS commission_estimate_cents,
  10.0 AS commission_rate_pct,
  now() AS refreshed_at
FROM order_bags ob
JOIN orders o ON ob.order_id = o.id
WHERE o.status NOT IN ('CANCELED', 'REJECTED')
  AND ob.financial_status IN ('PAID', 'PARTIALLY_PAID')
GROUP BY ob.merchant_name;

-- Unique index for CONCURRENTLY refresh
CREATE UNIQUE INDEX idx_mv_commission_summary_merchant
  ON public.mv_commission_summary (merchant_name);

-- ── Time-Filtered Dashboard Function ────────────────────────────────────────
-- Dynamic time-range queries that can't be materialized.
-- Returns metrics for a specific date range.
CREATE OR REPLACE FUNCTION public.fn_dashboard_metrics_by_range(
  p_start TIMESTAMPTZ DEFAULT now() - interval '30 days',
  p_end TIMESTAMPTZ DEFAULT now()
) RETURNS TABLE (
  total_orders BIGINT,
  gross_revenue_cents BIGINT,
  commission_estimate_cents BIGINT,
  active_users BIGINT,
  total_visitors BIGINT,
  conversion_rate NUMERIC,
  ai_search_usage_pct NUMERIC
) AS $$
DECLARE
  v_total_orders BIGINT;
  v_gross_revenue BIGINT;
  v_commission BIGINT;
  v_active_users BIGINT;
  v_total_visitors BIGINT;
  v_search_users BIGINT;
BEGIN
  -- Order metrics for the period
  SELECT
    COUNT(DISTINCT o.id),
    COALESCE(SUM(o.total), 0),
    COALESCE(SUM(public.estimate_commission(ob.subtotal)), 0)
  INTO v_total_orders, v_gross_revenue, v_commission
  FROM orders o
  LEFT JOIN order_bags ob ON ob.order_id = o.id
  WHERE o.created_at BETWEEN p_start AND p_end
    AND o.status NOT IN ('CANCELED', 'REJECTED');

  -- Active users = unique authenticated users with tracked events in period.
  -- Note: user_events only tracks authenticated users (user_id NOT NULL).
  -- Anonymous visitor tracking is not yet implemented, so total_visitors = active_users.
  SELECT COUNT(DISTINCT user_id)
  INTO v_active_users
  FROM public.user_events
  WHERE created_at BETWEEN p_start AND p_end;

  -- Total visitors approximation — same as active_users until anonymous tracking exists.
  -- Conversion rate (orders/visitors) is therefore an upper-bound estimate.
  v_total_visitors := v_active_users;

  -- AI search usage = users who searched / total active users
  SELECT COUNT(DISTINCT user_id)
  INTO v_search_users
  FROM public.user_events
  WHERE event_type = 'search'
    AND created_at BETWEEN p_start AND p_end;

  RETURN QUERY SELECT
    v_total_orders,
    v_gross_revenue,
    v_commission,
    v_active_users,
    v_total_visitors,
    CASE WHEN v_total_visitors > 0
      THEN ROUND(v_total_orders::NUMERIC / v_total_visitors * 100, 1)
      ELSE 0.0
    END,
    CASE WHEN v_active_users > 0
      THEN ROUND(v_search_users::NUMERIC / v_active_users * 100, 1)
      ELSE 0.0
    END;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

COMMENT ON FUNCTION public.fn_dashboard_metrics_by_range(TIMESTAMPTZ, TIMESTAMPTZ) IS
  'Dashboard KPIs for a given date range. Used by admin dashboard time filter.';

-- Restrict: only service_role can call this function (contains sensitive business metrics).
REVOKE EXECUTE ON FUNCTION public.fn_dashboard_metrics_by_range(TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_dashboard_metrics_by_range(TIMESTAMPTZ, TIMESTAMPTZ) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_dashboard_metrics_by_range(TIMESTAMPTZ, TIMESTAMPTZ) FROM anon;

-- ── Refresh Helper ──────────────────────────────────────────────────────────
-- Refreshes both materialized views. Called from admin dashboard or cron.
CREATE OR REPLACE FUNCTION public.refresh_dashboard_views()
RETURNS VOID AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_dashboard_metrics;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_commission_summary;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.refresh_dashboard_views() IS
  'Refresh both dashboard materialized views. Call from admin UI or cron.';

-- Restrict: only service_role can refresh views.
REVOKE EXECUTE ON FUNCTION public.refresh_dashboard_views() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.refresh_dashboard_views() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.refresh_dashboard_views() FROM anon;

-- ── Access Control ──────────────────────────────────────────────────────────
-- Materialized views contain sensitive business metrics.
-- Only service_role (used by the admin dashboard handler) should access them.
ALTER MATERIALIZED VIEW public.mv_dashboard_metrics OWNER TO postgres;
ALTER MATERIALIZED VIEW public.mv_commission_summary OWNER TO postgres;

-- Revoke any default access — only postgres/service_role can query these views.
-- Materialized views do NOT support RLS, so GRANT-level restriction is necessary.
REVOKE SELECT ON public.mv_dashboard_metrics FROM PUBLIC;
REVOKE SELECT ON public.mv_dashboard_metrics FROM authenticated;
REVOKE SELECT ON public.mv_dashboard_metrics FROM anon;
REVOKE SELECT ON public.mv_commission_summary FROM PUBLIC;
REVOKE SELECT ON public.mv_commission_summary FROM authenticated;
REVOKE SELECT ON public.mv_commission_summary FROM anon;
