-- Story 8.3: Analytics & Commission Dashboard
-- Admin role management via Supabase Auth custom claims (app_metadata).
--
-- ## Design Decision: Custom Claims vs. Separate Table
-- Admin role is stored in auth.users.raw_app_meta_data as {"user_role": "admin"}.
-- The JWT automatically includes app_metadata, so RLS policies can check
-- auth.jwt() -> 'app_metadata' ->> 'user_role' without additional queries.
-- This is the standard Supabase pattern for simple role-based access.
--
-- ## How to Set Admin
-- Use the set_admin_role() function below, or update directly:
--   UPDATE auth.users
--   SET raw_app_meta_data = raw_app_meta_data || '{"user_role": "admin"}'::jsonb
--   WHERE id = 'USER_UUID';

-- ── Admin Check Function ────────────────────────────────────────────────────
-- Returns true if the current JWT has user_role = 'admin' in app_metadata.
-- STABLE: result doesn't change within a transaction for the same JWT.
-- SECURITY DEFINER: runs with the privileges of the function owner (postgres).
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'user_role') = 'admin',
    false
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

COMMENT ON FUNCTION public.is_admin() IS
  'Check if current user has admin role via JWT app_metadata custom claim';

-- ── Admin Role Assignment ───────────────────────────────────────────────────
-- Sets user_role = 'admin' in auth.users.raw_app_meta_data.
-- Must be called with service_role (or as superuser in SQL Editor).
-- Merges with existing app_metadata (does not overwrite other keys).
CREATE OR REPLACE FUNCTION public.set_admin_role(target_user_id UUID)
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

COMMENT ON FUNCTION public.set_admin_role(UUID) IS
  'Grant admin role to a user. Run from SQL Editor or service_role client.';

-- Restrict: only service_role (or superuser) can call this function.
-- Without this, any authenticated user could self-promote to admin.
REVOKE EXECUTE ON FUNCTION public.set_admin_role(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_admin_role(UUID) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.set_admin_role(UUID) FROM anon;

-- ── Remove Admin Role ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.remove_admin_role(target_user_id UUID)
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

COMMENT ON FUNCTION public.remove_admin_role(UUID) IS
  'Revoke admin role from a user. Run from SQL Editor or service_role client.';

-- Restrict: only service_role (or superuser) can call this function.
REVOKE EXECUTE ON FUNCTION public.remove_admin_role(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.remove_admin_role(UUID) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.remove_admin_role(UUID) FROM anon;

-- ── Admin RLS Policies ──────────────────────────────────────────────────────
-- Additive policies: admins can SELECT all rows in dashboard-relevant tables.
-- Existing user policies remain unchanged (users still see only their own data).

-- Orders: admin can read ALL orders (not just their own)
CREATE POLICY "admin_read_all_orders" ON orders
  FOR SELECT TO authenticated
  USING (public.is_admin());

-- Order bags: admin can read ALL bags
CREATE POLICY "admin_read_all_order_bags" ON order_bags
  FOR SELECT TO authenticated
  USING (public.is_admin());

-- Order items: admin can read ALL items
CREATE POLICY "admin_read_all_order_items" ON order_items
  FOR SELECT TO authenticated
  USING (public.is_admin());

-- User events: admin can read ALL events (for analytics)
CREATE POLICY "admin_read_all_user_events" ON public.user_events
  FOR SELECT TO authenticated
  USING (public.is_admin());
