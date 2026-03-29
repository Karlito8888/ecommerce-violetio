-- M2: Fix commission views to use real per-bag commission_rate
-- Replaces the hardcoded 10.0 with per-bag rates from order_bags.commission_rate.

-- ── Drop and recreate mv_commission_summary ──────────────────────────────────
DROP MATERIALIZED VIEW IF EXISTS public.mv_commission_summary;

CREATE MATERIALIZED VIEW public.mv_commission_summary AS
SELECT
  ob.merchant_name,
  COUNT(DISTINCT ob.id) AS bag_count,
  COALESCE(SUM(ob.subtotal), 0) AS gross_subtotal_cents,
  COALESCE(SUM(public.estimate_commission(ob.subtotal, ob.commission_rate)), 0) AS commission_estimate_cents,
  AVG(ob.commission_rate) AS commission_rate_pct,
  now() AS refreshed_at
FROM order_bags ob
JOIN orders o ON ob.order_id = o.id
WHERE o.status NOT IN ('CANCELED', 'REJECTED')
  AND ob.financial_status IN ('PAID', 'PARTIALLY_PAID')
GROUP BY ob.merchant_name;

-- Unique index required for CONCURRENTLY refresh
CREATE UNIQUE INDEX idx_mv_commission_summary_merchant
  ON public.mv_commission_summary (merchant_name);

-- Restore access control (same as original migration)
ALTER MATERIALIZED VIEW public.mv_commission_summary OWNER TO postgres;
REVOKE SELECT ON public.mv_commission_summary FROM PUBLIC;
REVOKE SELECT ON public.mv_commission_summary FROM authenticated;
REVOKE SELECT ON public.mv_commission_summary FROM anon;

-- ── Fix fn_dashboard_metrics_by_range ────────────────────────────────────────
-- Replace the implicit DEFAULT 10.0 with per-bag commission_rate.
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
  SELECT
    COUNT(DISTINCT o.id),
    COALESCE(SUM(o.total), 0),
    COALESCE(SUM(public.estimate_commission(ob.subtotal, ob.commission_rate)), 0)
  INTO v_total_orders, v_gross_revenue, v_commission
  FROM orders o
  LEFT JOIN order_bags ob ON ob.order_id = o.id
  WHERE o.created_at BETWEEN p_start AND p_end
    AND o.status NOT IN ('CANCELED', 'REJECTED');

  SELECT COUNT(DISTINCT user_id)
  INTO v_active_users
  FROM public.user_events
  WHERE created_at BETWEEN p_start AND p_end;

  v_total_visitors := v_active_users;

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

-- Restore access restrictions
REVOKE EXECUTE ON FUNCTION public.fn_dashboard_metrics_by_range(TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_dashboard_metrics_by_range(TIMESTAMPTZ, TIMESTAMPTZ) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_dashboard_metrics_by_range(TIMESTAMPTZ, TIMESTAMPTZ) FROM anon;
