-- Migration: Cleanup abandoned carts — pg_cron job + completed status tracking
-- Timestamp: 20260414125612
--
-- Problem: Carts remain 'active' in Supabase indefinitely, even after order
-- completion or genuine abandonment. This creates unbounded table growth and
-- stale data. Per Violet docs: "Carts persist indefinitely — implement cleanup
-- for abandoned carts."
--
-- Solution:
--   1. Mark carts as 'completed' when the order is persisted (application code)
--   2. Schedule pg_cron job to mark carts as 'abandoned' when active > 30 days
--   3. Delete cart_items + carts rows older than 90 days with 'abandoned' status
--
-- @see https://docs.violet.io/prism/checkout-guides/carts-and-bags/carts.md — Best Practices

-- =============================================================================
-- 1. Enable pg_cron extension (requires superuser — may need dashboard activation)
-- =============================================================================
-- On Supabase Cloud, pg_cron is available but must be enabled via:
--   Dashboard → Database → Extensions → search "pg_cron" → Enable
-- OR via SQL with sufficient privileges.
-- We use IF NOT EXISTS to be idempotent.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

-- Grant pg_cron usage to the postgres role (Supabase superuser)
-- This is typically already granted, but ensures it on self-hosted setups.
-- GRANT USAGE ON SCHEMA cron TO postgres;  -- only needed on self-hosted

-- =============================================================================
-- 2. Index for efficient abandoned cart cleanup
-- =============================================================================
-- The cleanup query filters by status='active' and created_at < threshold.
-- A partial index makes this near-instant even at millions of rows.
CREATE INDEX IF NOT EXISTS idx_carts_active_created
  ON carts (created_at)
  WHERE status = 'active';

-- Index for pruning old abandoned carts
CREATE INDEX IF NOT EXISTS idx_carts_abandoned_created
  ON carts (created_at)
  WHERE status = 'abandoned';

-- =============================================================================
-- 3. RPC function: cleanup_abandoned_carts()
-- =============================================================================
-- Marks carts as 'abandoned' when they've been active with no updates for 30+
-- days. Also hard-deletes carts that have been 'abandoned' for 90+ days.
--
-- This function is idempotent and safe to run repeatedly.
-- Returns a JSON summary for monitoring/debugging.
--
-- Why 30 days for abandonment:
--   - Cart lifetime in Violet is tied to the checkout session
--   - A cart with no activity for 30 days is definitively abandoned
--   - 30 days gives ample buffer for slow shoppers and cart sync delays
--
-- Why 90 days for hard deletion:
--   - Matches the webhook_events retention policy (90 days for processed events)
--   - Abandoned cart data has negligible analytics value after 90 days
--   - Reduces storage costs and table bloat
CREATE OR REPLACE FUNCTION public.cleanup_abandoned_carts()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  abandoned_count int;
  deleted_count int;
  result jsonb;
BEGIN
  -- Step 1: Mark active carts with no update for 30+ days as 'abandoned'
  -- Uses the partial index idx_carts_active_created for efficiency
  UPDATE carts
  SET status = 'abandoned',
      updated_at = now()
  WHERE status = 'active'
    AND updated_at < now() - interval '30 days';

  GET DIAGNOSTICS abandoned_count = ROW_COUNT;

  -- Step 2: Hard-delete carts abandoned for 90+ days
  -- CASCADE on the FK ensures cart_items are deleted automatically
  DELETE FROM carts
  WHERE status = 'abandoned'
    AND updated_at < now() - interval '90 days';

  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  -- Return summary for monitoring
  result := jsonb_build_object(
    'abandoned', abandoned_count,
    'deleted', deleted_count,
    'ran_at', now()
  );

  -- Log to error_logs for operational visibility (non-blocking)
  INSERT INTO error_logs (source, error_type, message, context)
  VALUES (
    'system',
    'CRON.CART_CLEANUP',
    'Abandoned cart cleanup completed',
    result
  );

  RETURN result;
END;
$$;

-- =============================================================================
-- 4. Schedule pg_cron job — daily at 3:00 AM UTC
-- =============================================================================
-- Runs in the Supabase queue worker (low-traffic window).
-- Unschedules first to avoid duplicate schedules on re-migration.
SELECT cron.unschedule('cleanup-abandoned-carts');

SELECT cron.schedule(
  'cleanup-abandoned-carts',
  '0 3 * * *',  -- Every day at 03:00 UTC
  $$SELECT public.cleanup_abandoned_carts();$$
);

-- =============================================================================
-- 5. RPC function: mark_cart_completed(violet_cart_id text)
-- =============================================================================
-- Called from application code after successful order persistence.
-- Marks the Supabase cart row as 'completed' so the cleanup job doesn't
-- touch it. This is the missing piece: currently carts stay 'active' even
-- after the order is submitted and persisted.
CREATE OR REPLACE FUNCTION public.mark_cart_completed(p_violet_cart_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected int;
BEGIN
  UPDATE carts
  SET status = 'completed',
      updated_at = now()
  WHERE violet_cart_id = p_violet_cart_id
    AND status = 'active';

  GET DIAGNOSTICS affected = ROW_COUNT;

  -- Return true if at least one row was updated
  RETURN affected > 0;
END;
$$;

-- =============================================================================
-- 6. Grant execute to authenticated and anon roles
-- =============================================================================
-- mark_cart_completed is called from server functions using the service_role
-- client, so these grants are for documentation/completeness.
-- cleanup_abandoned_carts is called by pg_cron (runs as superuser).
GRANT EXECUTE ON FUNCTION public.cleanup_abandoned_carts() TO postgres;
GRANT EXECUTE ON FUNCTION public.mark_cart_completed(text) TO postgres, service_role;
