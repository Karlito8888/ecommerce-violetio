-- Epic 8 Code Review Fixes
-- This migration addresses multiple security and performance issues found during L1 code review.
--
-- ## Summary of fixes:
-- 1a. Wrap is_admin() in RLS policies with (SELECT ...) to avoid per-row re-evaluation
-- 1b. Move SECURITY DEFINER functions to `private` schema (reduced attack surface)
-- 1c. REVOKE EXECUTE on estimate_commission from public roles
-- 1d. Add updated_at column + auto-update trigger to alert_rules
-- 1e. Add documentation comment on alert_rules.description column
--
-- All fixes are idempotent where possible (IF NOT EXISTS, DROP IF EXISTS).

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════════
-- FIX 1b: Create `private` schema for SECURITY DEFINER functions
-- ═══════════════════════════════════════════════════════════════════════════════
-- WHY: SECURITY DEFINER functions run with the privileges of the function owner
-- (postgres). Placing them in the `public` schema exposes them to PostgREST's
-- auto-discovery, making them callable via the REST API unless explicitly REVOKEd.
-- Moving to a `private` schema adds defense-in-depth: even if REVOKE is
-- accidentally removed, the function remains invisible to PostgREST.
-- Reference: https://supabase.com/docs/guides/database/functions#security-definer-vs-invoker

CREATE SCHEMA IF NOT EXISTS private;

-- Revoke all default privileges on private schema from public roles.
-- Only postgres (owner) and service_role should access this schema.
REVOKE ALL ON SCHEMA private FROM PUBLIC;
REVOKE ALL ON SCHEMA private FROM anon;
REVOKE ALL ON SCHEMA private FROM authenticated;

-- Grant usage to postgres (implicit as owner) and service_role for internal calls.
GRANT USAGE ON SCHEMA private TO service_role;

-- ── Move is_admin() to private schema ──────────────────────────────────────────
-- WHY: is_admin() is SECURITY DEFINER and reads auth.jwt(). Keeping it in public
-- means any user could potentially call it directly (even though it only returns
-- a boolean). In private schema, it's only reachable from RLS policy evaluation
-- and from other server-side code.
CREATE OR REPLACE FUNCTION private.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'user_role') = 'admin',
    false
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

COMMENT ON FUNCTION private.is_admin() IS
  'Check if current user has admin role via JWT app_metadata custom claim. Lives in private schema to prevent direct REST API access.';

-- Drop the old public version after creating the private one.
DROP FUNCTION IF EXISTS public.is_admin();

-- ── Move set_admin_role() to private schema ────────────────────────────────────
-- WHY: Writes to auth.users with SECURITY DEFINER privileges. Must never be
-- accessible via PostgREST. Already REVOKEd, but private schema is defense-in-depth.
CREATE OR REPLACE FUNCTION private.set_admin_role(target_user_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE auth.users
  SET raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"user_role": "admin"}'::jsonb
  WHERE id = target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User % not found', target_user_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION private.set_admin_role(UUID) IS
  'Grant admin role to a user. Run from SQL Editor or service_role client only.';

-- Restrict execution even within private schema (belt-and-suspenders).
REVOKE EXECUTE ON FUNCTION private.set_admin_role(UUID) FROM PUBLIC;

DROP FUNCTION IF EXISTS public.set_admin_role(UUID);

-- ── Move remove_admin_role() to private schema ────────────────────────────────
CREATE OR REPLACE FUNCTION private.remove_admin_role(target_user_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE auth.users
  SET raw_app_meta_data = raw_app_meta_data - 'user_role'
  WHERE id = target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User % not found', target_user_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION private.remove_admin_role(UUID) IS
  'Revoke admin role from a user. Run from SQL Editor or service_role client only.';

REVOKE EXECUTE ON FUNCTION private.remove_admin_role(UUID) FROM PUBLIC;

DROP FUNCTION IF EXISTS public.remove_admin_role(UUID);

-- ── Move fn_dashboard_metrics_by_range() to private schema ─────────────────────
-- WHY: Contains sensitive business metrics aggregation with SECURITY DEFINER.
-- Called via .rpc() from the app, so we keep a thin public wrapper that delegates
-- to the private function. The public wrapper is SECURITY INVOKER (safe) and
-- still REVOKEd from non-service roles.
CREATE OR REPLACE FUNCTION private.fn_dashboard_metrics_by_range(
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
    COALESCE(SUM(public.estimate_commission(ob.subtotal)), 0)
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

COMMENT ON FUNCTION private.fn_dashboard_metrics_by_range(TIMESTAMPTZ, TIMESTAMPTZ) IS
  'Dashboard KPIs for a given date range. Private implementation — called via public wrapper.';

REVOKE EXECUTE ON FUNCTION private.fn_dashboard_metrics_by_range(TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC;

-- Replace the public function with a thin SECURITY INVOKER wrapper.
-- WHY: PostgREST only exposes `public` schema functions via .rpc(). We keep
-- the public name so existing app code (supabase.rpc("fn_dashboard_metrics_by_range", ...))
-- continues to work, but the actual privileged logic lives in private schema.
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
BEGIN
  -- Delegate to the private SECURITY DEFINER implementation.
  RETURN QUERY SELECT * FROM private.fn_dashboard_metrics_by_range(p_start, p_end);
END;
$$ LANGUAGE plpgsql STABLE SECURITY INVOKER;

COMMENT ON FUNCTION public.fn_dashboard_metrics_by_range(TIMESTAMPTZ, TIMESTAMPTZ) IS
  'Public wrapper for private.fn_dashboard_metrics_by_range. SECURITY INVOKER — safe to expose via PostgREST.';

-- Keep existing REVOKE rules on the public wrapper (service_role only).
REVOKE EXECUTE ON FUNCTION public.fn_dashboard_metrics_by_range(TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_dashboard_metrics_by_range(TIMESTAMPTZ, TIMESTAMPTZ) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_dashboard_metrics_by_range(TIMESTAMPTZ, TIMESTAMPTZ) FROM anon;

-- ── Move fn_health_metrics() to private schema ────────────────────────────────
CREATE OR REPLACE FUNCTION private.fn_health_metrics(
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

  SELECT COUNT(*)
  INTO v_error_count
  FROM public.error_logs
  WHERE created_at >= v_cutoff;

  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'processed'),
    COUNT(*) FILTER (WHERE status = 'failed')
  INTO v_webhook_total, v_webhook_success, v_webhook_failed
  FROM public.webhook_events
  WHERE created_at >= v_cutoff;

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

COMMENT ON FUNCTION private.fn_health_metrics(INTEGER) IS
  'Aggregated platform health metrics. Private implementation — called via public wrapper.';

REVOKE EXECUTE ON FUNCTION private.fn_health_metrics(INTEGER) FROM PUBLIC;

-- Public wrapper for PostgREST compatibility.
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
BEGIN
  RETURN QUERY SELECT * FROM private.fn_health_metrics(p_hours);
END;
$$ LANGUAGE plpgsql STABLE SECURITY INVOKER;

COMMENT ON FUNCTION public.fn_health_metrics(INTEGER) IS
  'Public wrapper for private.fn_health_metrics. SECURITY INVOKER — safe to expose via PostgREST.';

REVOKE EXECUTE ON FUNCTION public.fn_health_metrics(INTEGER) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_health_metrics(INTEGER) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_health_metrics(INTEGER) FROM anon;

-- ── Move refresh_dashboard_views() to private schema ──────────────────────────
CREATE OR REPLACE FUNCTION private.refresh_dashboard_views()
RETURNS VOID AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_dashboard_metrics;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_commission_summary;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION private.refresh_dashboard_views() IS
  'Refresh both dashboard materialized views. Private implementation.';

REVOKE EXECUTE ON FUNCTION private.refresh_dashboard_views() FROM PUBLIC;

-- Public wrapper for PostgREST compatibility.
CREATE OR REPLACE FUNCTION public.refresh_dashboard_views()
RETURNS VOID AS $$
BEGIN
  PERFORM private.refresh_dashboard_views();
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;

COMMENT ON FUNCTION public.refresh_dashboard_views() IS
  'Public wrapper for private.refresh_dashboard_views. SECURITY INVOKER — safe to expose.';

REVOKE EXECUTE ON FUNCTION public.refresh_dashboard_views() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.refresh_dashboard_views() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.refresh_dashboard_views() FROM anon;


-- ═══════════════════════════════════════════════════════════════════════════════
-- FIX 1a: Wrap is_admin() in RLS policies with (SELECT ...)
-- ═══════════════════════════════════════════════════════════════════════════════
-- WHY: Without (SELECT ...), PostgreSQL re-evaluates the function for EVERY ROW
-- scanned by the query. Wrapping in a scalar subquery forces the planner to
-- evaluate it once and cache the result for the entire query.
-- Per Supabase benchmarks, this can improve RLS policy evaluation from
-- 178,000ms to 12ms on large tables.
-- Reference: https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select

-- ── Policies from 20260402000000_admin_roles.sql ──────────────────────────────

-- orders: admin can read ALL orders
DROP POLICY IF EXISTS "admin_read_all_orders" ON orders;
CREATE POLICY "admin_read_all_orders" ON orders
  FOR SELECT TO authenticated
  USING ((select private.is_admin()));

-- order_bags: admin can read ALL bags
DROP POLICY IF EXISTS "admin_read_all_order_bags" ON order_bags;
CREATE POLICY "admin_read_all_order_bags" ON order_bags
  FOR SELECT TO authenticated
  USING ((select private.is_admin()));

-- order_items: admin can read ALL items
DROP POLICY IF EXISTS "admin_read_all_order_items" ON order_items;
CREATE POLICY "admin_read_all_order_items" ON order_items
  FOR SELECT TO authenticated
  USING ((select private.is_admin()));

-- user_events: admin can read ALL events (for analytics)
DROP POLICY IF EXISTS "admin_read_all_user_events" ON public.user_events;
CREATE POLICY "admin_read_all_user_events" ON public.user_events
  FOR SELECT TO authenticated
  USING ((select private.is_admin()));

-- ── Policies from 20260403000000_admin_support_rls.sql ────────────────────────

-- support_inquiries: admin can read all
DROP POLICY IF EXISTS "admin_read_support" ON public.support_inquiries;
CREATE POLICY "admin_read_support" ON public.support_inquiries
  FOR SELECT TO authenticated
  USING ((select private.is_admin()));

-- support_inquiries: admin can update (status, internal_notes)
DROP POLICY IF EXISTS "admin_update_support" ON public.support_inquiries;
CREATE POLICY "admin_update_support" ON public.support_inquiries
  FOR UPDATE TO authenticated
  USING ((select private.is_admin()))
  WITH CHECK ((select private.is_admin()));

-- ── Policies from 20260404000000_health_monitoring.sql ────────────────────────

-- error_logs: admin can read
DROP POLICY IF EXISTS "admin_read_errors" ON public.error_logs;
CREATE POLICY "admin_read_errors" ON public.error_logs
  FOR SELECT TO authenticated
  USING ((select private.is_admin()));

-- webhook_events: admin can read
DROP POLICY IF EXISTS "admin_read_webhooks" ON public.webhook_events;
CREATE POLICY "admin_read_webhooks" ON public.webhook_events
  FOR SELECT TO authenticated
  USING ((select private.is_admin()));

-- alert_rules: admin can read
DROP POLICY IF EXISTS "admin_read_alert_rules" ON public.alert_rules;
CREATE POLICY "admin_read_alert_rules" ON public.alert_rules
  FOR SELECT TO authenticated
  USING ((select private.is_admin()));

-- alert_rules: admin can update (toggle enabled, update thresholds)
DROP POLICY IF EXISTS "admin_update_alert_rules" ON public.alert_rules;
CREATE POLICY "admin_update_alert_rules" ON public.alert_rules
  FOR UPDATE TO authenticated
  USING ((select private.is_admin()))
  WITH CHECK ((select private.is_admin()));


-- ═══════════════════════════════════════════════════════════════════════════════
-- FIX 1c: REVOKE EXECUTE on estimate_commission from public roles
-- ═══════════════════════════════════════════════════════════════════════════════
-- WHY: estimate_commission() exposes internal commission rate logic. While it's
-- IMMUTABLE and doesn't access tables, there's no reason for anonymous or
-- authenticated users to call it directly. It's only used internally by
-- materialized views and fn_dashboard_metrics_by_range().
REVOKE EXECUTE ON FUNCTION public.estimate_commission(INTEGER, NUMERIC) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.estimate_commission(INTEGER, NUMERIC) FROM anon;
REVOKE EXECUTE ON FUNCTION public.estimate_commission(INTEGER, NUMERIC) FROM authenticated;


-- ═══════════════════════════════════════════════════════════════════════════════
-- FIX 1d: Add updated_at column to alert_rules with auto-update trigger
-- ═══════════════════════════════════════════════════════════════════════════════
-- WHY: alert_rules has created_at but no updated_at. When admins toggle rules
-- or change thresholds, we need to track when the last modification happened
-- (for audit trail and cache invalidation). Every other mutable table in the
-- project follows this pattern.

ALTER TABLE public.alert_rules
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Auto-update trigger using the existing update_updated_at_column() function
-- (defined in 20260319000000_orders.sql). Same pattern used by orders, order_bags,
-- faq_items, support_inquiries, content_pages, wishlists, etc.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'set_updated_at_alert_rules'
  ) THEN
    CREATE TRIGGER set_updated_at_alert_rules
      BEFORE UPDATE ON public.alert_rules
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;


-- ═══════════════════════════════════════════════════════════════════════════════
-- FIX 1e: Document alert_rules.description column for client type generation
-- ═══════════════════════════════════════════════════════════════════════════════
-- WHY: Supabase CLI generates TypeScript types from the database schema via
-- `supabase gen types`. Column comments appear in the generated types as JSDoc,
-- making the API self-documenting for frontend developers.
COMMENT ON COLUMN public.alert_rules.description IS
  'Human-readable description of what this alert rule monitors. Displayed in the admin health dashboard UI. Included in generated client types.';

COMMENT ON COLUMN public.alert_rules.updated_at IS
  'Timestamp of last modification. Auto-updated via trigger. Used for audit trail and cache invalidation.';

COMMIT;
