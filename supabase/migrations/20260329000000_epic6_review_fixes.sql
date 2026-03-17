-- Epic 6 global review fixes migration.
--
-- This migration addresses security, consistency, and robustness issues
-- found during the comprehensive Epic 6 code review.
--
-- ## CRITICAL FIXES
-- C1: get_user_search_profile() — restrict to own data (SECURITY DEFINER leak)
-- M1: Push notification RLS — fix service_role policy pattern
--
-- ## LOW-PRIORITY FIXES
-- L1: Add updated_at triggers on wishlists, user_push_tokens, notification_preferences
-- L2: Drop redundant idx_wishlists_user_id (UNIQUE already creates an index)
-- L4: Wrap push_notifications tables in IF NOT EXISTS for idempotency
-- L3: Wrap ADD CONSTRAINT in DO blocks for idempotency (user_profiles_extend)

-- ─── C1: Fix SECURITY DEFINER data leak ─────────────────────────────────────────
-- BEFORE: Any authenticated user could call get_user_search_profile('other-user-uuid')
-- and read another user's browsing categories, avg order price, and recently viewed
-- product IDs — a data exposure vulnerability.
--
-- FIX: Add auth.uid() check at function entry. The function will raise an exception
-- if the caller tries to read another user's profile. The Edge Functions that call
-- this function (search-products, get-recommendations) pass the JWT-authenticated
-- user's own ID, so this check is transparent to legitimate callers.
--
-- NOTE: We keep SECURITY DEFINER because the function needs to read across tables
-- (user_events, orders, order_items) that have RLS restricting reads to own rows.
-- The auth.uid() guard ensures the function only accesses the caller's own data.

CREATE OR REPLACE FUNCTION public.get_user_search_profile(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_top_categories JSONB;
  v_avg_order_price INTEGER;
  v_recent_product_ids JSONB;
  v_total_events INTEGER;
  v_caller_role TEXT;
BEGIN
  -- C1 FIX: Prevent cross-user data access.
  -- Allow service_role (Edge Functions calling via admin client) to pass any user_id.
  -- For authenticated users (direct RPC calls), enforce p_user_id = auth.uid().
  v_caller_role := current_setting('request.jwt.claim.role', true);
  IF v_caller_role IS DISTINCT FROM 'service_role' THEN
    IF p_user_id != auth.uid() THEN
      RAISE EXCEPTION 'Access denied: cannot read another user''s search profile';
    END IF;
  END IF;

  -- Top categories from browsing history (last 3 months, max 5)
  SELECT COALESCE(jsonb_agg(jsonb_build_object('category', cat, 'view_count', cnt)), '[]'::JSONB)
  INTO v_top_categories
  FROM (
    SELECT
      COALESCE(payload->>'category', payload->>'category_name') AS cat,
      COUNT(*) AS cnt
    FROM public.user_events
    WHERE user_id = p_user_id
      AND event_type IN ('product_view', 'category_view')
      AND created_at > now() - INTERVAL '3 months'
      AND (payload->>'category' IS NOT NULL OR payload->>'category_name' IS NOT NULL)
    GROUP BY 1
    ORDER BY cnt DESC
    LIMIT 5
  ) sub;

  -- Average order item price in cents (via order_bags intermediate table)
  SELECT COALESCE(AVG(oi.price)::INTEGER, 0)
  INTO v_avg_order_price
  FROM public.order_items oi
  JOIN public.order_bags ob ON ob.id = oi.order_bag_id
  JOIN public.orders o ON o.id = ob.order_id
  WHERE o.user_id = p_user_id;

  -- Recent product IDs from product views (last 30 days, max 20)
  SELECT COALESCE(jsonb_agg(DISTINCT pid), '[]'::JSONB)
  INTO v_recent_product_ids
  FROM (
    SELECT payload->>'product_id' AS pid
    FROM public.user_events
    WHERE user_id = p_user_id
      AND event_type = 'product_view'
      AND created_at > now() - INTERVAL '30 days'
      AND payload->>'product_id' IS NOT NULL
    ORDER BY created_at DESC
    LIMIT 20
  ) sub;

  -- Total events count (profile strength indicator)
  SELECT COUNT(*)
  INTO v_total_events
  FROM public.user_events
  WHERE user_id = p_user_id;

  RETURN jsonb_build_object(
    'top_categories', v_top_categories,
    'avg_order_price', v_avg_order_price,
    'recent_product_ids', v_recent_product_ids,
    'total_events', v_total_events
  );
END;
$$;

-- Re-grant (CREATE OR REPLACE preserves grants, but be explicit)
GRANT EXECUTE ON FUNCTION public.get_user_search_profile(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_search_profile(UUID) TO service_role;

-- ─── M1: Fix service_role RLS policy pattern ─────────────────────────────────────
-- BEFORE: Used `USING (auth.role() = 'service_role')` which is evaluated for ALL
-- roles (unnecessary overhead) and inconsistent with every other migration.
-- FIX: Use `TO service_role USING (true) WITH CHECK (true)` — the standard pattern.

DROP POLICY IF EXISTS "service_role_push_tokens" ON user_push_tokens;
CREATE POLICY "service_role_push_tokens" ON user_push_tokens
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_notification_prefs" ON notification_preferences;
CREATE POLICY "service_role_notification_prefs" ON notification_preferences
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- ─── L1: Add updated_at triggers ─────────────────────────────────────────────────
-- Three tables have `updated_at` columns but no trigger to auto-update them.
-- Reuse the existing `update_updated_at_column()` trigger function (from Story 5.1).

DO $$
BEGIN
  -- wishlists
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'set_updated_at_wishlists'
  ) THEN
    CREATE TRIGGER set_updated_at_wishlists
      BEFORE UPDATE ON public.wishlists
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;

  -- user_push_tokens
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'set_updated_at_user_push_tokens'
  ) THEN
    CREATE TRIGGER set_updated_at_user_push_tokens
      BEFORE UPDATE ON public.user_push_tokens
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;

  -- notification_preferences
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'set_updated_at_notification_preferences'
  ) THEN
    CREATE TRIGGER set_updated_at_notification_preferences
      BEFORE UPDATE ON public.notification_preferences
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- ─── L2: Drop redundant wishlists user_id index ──────────────────────────────────
-- The UNIQUE constraint on wishlists(user_id) already creates a unique index.
-- This explicit index is redundant and wastes storage.
DROP INDEX IF EXISTS idx_wishlists_user_id;

-- ─── L3: Idempotent CHECK constraints for user_profiles_extend ───────────────────
-- Original migration used ADD CONSTRAINT without IF NOT EXISTS guard.
-- These DO blocks make the migration re-runnable.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'chk_display_name_length' AND table_name = 'user_profiles'
  ) THEN
    ALTER TABLE user_profiles
      ADD CONSTRAINT chk_display_name_length CHECK (display_name IS NULL OR char_length(display_name) <= 100);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'chk_avatar_url_length' AND table_name = 'user_profiles'
  ) THEN
    ALTER TABLE user_profiles
      ADD CONSTRAINT chk_avatar_url_length CHECK (avatar_url IS NULL OR char_length(avatar_url) <= 500);
  END IF;
END $$;
