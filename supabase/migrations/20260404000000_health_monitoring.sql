-- Story 8.5: Platform Health Monitoring & Error Tracking
-- Adds admin read access to error_logs and webhook_events,
-- health metrics aggregation function, and alert rules table.

-- ── 1. Admin RLS Policies ────────────────────────────────────────────────────

-- error_logs already has RLS enabled with:
--   service_role_insert, users_read_own (auth.uid()), service_role_read_all.
-- This adds admin read access via session client.
CREATE POLICY "admin_read_errors" ON public.error_logs
  FOR SELECT TO authenticated
  USING (public.is_admin());

-- webhook_events has RLS enabled with NO policies (service_role bypass only).
-- This adds admin read access via session client.
CREATE POLICY "admin_read_webhooks" ON public.webhook_events
  FOR SELECT TO authenticated
  USING (public.is_admin());

-- ── 2. Health Metrics Aggregation Function ───────────────────────────────────
-- Returns error and webhook health metrics for a given time window.
-- Used by the admin health dashboard handler via service role client.
CREATE OR REPLACE FUNCTION public.fn_health_metrics(
  p_hours INTEGER DEFAULT 24
) RETURNS TABLE (
  error_count BIGINT,
  error_rate_per_hour NUMERIC,
  webhook_total BIGINT,
  webhook_success BIGINT,
  webhook_failed BIGINT,
  webhook_success_rate NUMERIC,
  top_error_types JSONB,
  consecutive_webhook_failures INTEGER
) AS $$
DECLARE
  v_error_count BIGINT;
  v_webhook_total BIGINT;
  v_webhook_success BIGINT;
  v_webhook_failed BIGINT;
  v_top_errors JSONB;
  v_consec_failures INTEGER;
  v_cutoff TIMESTAMPTZ;
BEGIN
  v_cutoff := now() - (p_hours || ' hours')::INTERVAL;

  -- Error count in window
  SELECT COUNT(*)
  INTO v_error_count
  FROM public.error_logs
  WHERE created_at >= v_cutoff;

  -- Webhook stats in window
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'processed'),
    COUNT(*) FILTER (WHERE status = 'failed')
  INTO v_webhook_total, v_webhook_success, v_webhook_failed
  FROM public.webhook_events
  WHERE created_at >= v_cutoff;

  -- Top error types (limit 10)
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::JSONB)
  INTO v_top_errors
  FROM (
    SELECT error_type, COUNT(*) AS count
    FROM public.error_logs
    WHERE created_at >= v_cutoff
    GROUP BY error_type
    ORDER BY count DESC
    LIMIT 10
  ) t;

  -- Consecutive webhook failures: count newest events until first non-failed
  SELECT COUNT(*)
  INTO v_consec_failures
  FROM (
    SELECT status,
           ROW_NUMBER() OVER (ORDER BY created_at DESC) AS rn
    FROM public.webhook_events
    ORDER BY created_at DESC
    LIMIT 50
  ) sub
  WHERE sub.status = 'failed'
    AND sub.rn <= (
      SELECT COALESCE(MIN(rn) - 1, 50)
      FROM (
        SELECT status,
               ROW_NUMBER() OVER (ORDER BY created_at DESC) AS rn
        FROM public.webhook_events
        ORDER BY created_at DESC
        LIMIT 50
      ) inner_sub
      WHERE inner_sub.status != 'failed'
    );

  RETURN QUERY SELECT
    v_error_count,
    CASE WHEN p_hours > 0
      THEN ROUND(v_error_count::NUMERIC / p_hours, 2)
      ELSE 0.0
    END,
    v_webhook_total,
    v_webhook_success,
    v_webhook_failed,
    CASE WHEN v_webhook_total > 0
      THEN ROUND(v_webhook_success::NUMERIC / v_webhook_total * 100, 1)
      ELSE 100.0
    END,
    v_top_errors,
    v_consec_failures;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

COMMENT ON FUNCTION public.fn_health_metrics(INTEGER) IS
  'Aggregated platform health metrics for a given hour window. Used by admin health dashboard.';

-- Restrict: only service_role can call this function.
REVOKE EXECUTE ON FUNCTION public.fn_health_metrics(INTEGER) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_health_metrics(INTEGER) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_health_metrics(INTEGER) FROM anon;

-- ── 3. Alert Rules Table ─────────────────────────────────────────────────────
-- Configurable alert thresholds for admin notifications.
CREATE TABLE IF NOT EXISTS public.alert_rules (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_name           TEXT NOT NULL UNIQUE,
  description         TEXT,
  threshold_value     INTEGER NOT NULL,
  time_window_minutes INTEGER NOT NULL,
  enabled             BOOLEAN NOT NULL DEFAULT true,
  last_triggered_at   TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.alert_rules ENABLE ROW LEVEL SECURITY;

-- Admin can read alert rules
CREATE POLICY "admin_read_alert_rules" ON public.alert_rules
  FOR SELECT TO authenticated
  USING (public.is_admin());

-- Admin can update alert rules (toggle enabled, update thresholds)
CREATE POLICY "admin_update_alert_rules" ON public.alert_rules
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Service role can do everything (for Edge Functions / Server Functions)
CREATE POLICY "service_role_all_alert_rules" ON public.alert_rules
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- Seed default alert rules
INSERT INTO public.alert_rules (rule_name, description, threshold_value, time_window_minutes) VALUES
  ('webhook_consecutive_failures', 'Alert when consecutive webhook failures exceed threshold', 3, 0),
  ('violet_unreachable', 'Alert when Violet API is unreachable for duration', 1, 5),
  ('failed_checkouts_spike', 'Alert when failed checkouts exceed threshold in time window', 10, 60),
  ('edge_function_error_rate', 'Alert when Edge Function error rate exceeds percentage in time window', 5, 15)
ON CONFLICT (rule_name) DO NOTHING;

COMMENT ON TABLE public.alert_rules IS
  'Configurable alert thresholds for platform health monitoring. Admin-managed.';
