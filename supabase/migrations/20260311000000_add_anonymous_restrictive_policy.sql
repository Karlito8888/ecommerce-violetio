-- Migration: add restrictive policy to prevent anonymous users from writing to user_profiles
-- Story: Epic 2 Review — RLS hardening per Supabase best practices
-- Anonymous users should only be able to SELECT their own profile (if it exists),
-- but not INSERT/UPDATE/DELETE. Profile creation happens during account conversion.

-- Restrictive policy: blocks anonymous users from write operations.
-- Combined with existing permissive "users_own_profile" policy, the effect is:
--   Authenticated (non-anonymous) users: full CRUD on own rows
--   Anonymous users: SELECT only on own rows (no INSERT/UPDATE/DELETE)
CREATE POLICY "block_anonymous_writes" ON public.user_profiles
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK ((select (auth.jwt()->>'is_anonymous')::boolean) IS NOT TRUE);

-- Performance: wrap auth.uid() in subselect for RLS evaluation caching
-- Drop and recreate the existing policy with optimized form
DROP POLICY IF EXISTS "users_own_profile" ON public.user_profiles;

CREATE POLICY "users_own_profile" ON public.user_profiles
  FOR ALL
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

COMMENT ON POLICY "block_anonymous_writes" ON public.user_profiles IS
  'Restrictive policy: prevents anonymous users from INSERT/UPDATE/DELETE. Anonymous users can only SELECT.';
