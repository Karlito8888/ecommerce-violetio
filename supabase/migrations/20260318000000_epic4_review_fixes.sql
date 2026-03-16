-- Migration: Epic 4 review fixes — indexes, constraints, RLS hardening, performance
-- Timestamp: 20260318000000
--
-- This migration addresses all issues found during the Epic 4 code review.
-- Each section is annotated with the problem, the fix, and the relevant best practice.

-- =============================================================================
-- 1. UNIQUE constraint on cart_items (cart_id, sku_id) — CRITICAL
-- =============================================================================
-- Problem: Edge Functions use .upsert({...}, { onConflict: "cart_id, sku_id" })
-- which requires a UNIQUE constraint on those columns. Without it, Postgres
-- raises: "there is no unique or exclusion constraint matching the ON CONFLICT".
-- Reference: https://supabase.com/docs/reference/javascript/upsert
CREATE UNIQUE INDEX IF NOT EXISTS idx_cart_items_cart_sku
  ON cart_items (cart_id, sku_id);

-- =============================================================================
-- 2. Index on cart_items.cart_id for FK lookups and RLS sub-selects
-- =============================================================================
-- Problem: RLS policies on cart_items use "cart_id IN (SELECT id FROM carts WHERE ...)"
-- and getProductInfoMap queries filter by cart_id. Without an index, Postgres
-- must sequential-scan cart_items for every policy check.
-- Reference: Supabase RLS performance guide — index columns used in policies.
CREATE INDEX IF NOT EXISTS idx_cart_items_cart_id
  ON cart_items (cart_id);

-- =============================================================================
-- 3. Index on error_logs.user_id for RLS policy
-- =============================================================================
-- Problem: The "users_read_own" RLS policy filters by user_id = auth.uid().
-- As error_logs grows, this becomes a full table scan without an index.
-- Reference: Supabase RLS performance guide — always index policy filter columns.
CREATE INDEX IF NOT EXISTS idx_error_logs_user_id
  ON error_logs (user_id)
  WHERE user_id IS NOT NULL;

-- =============================================================================
-- 4. Fix RLS policies — add TO role, use (select auth.uid()) optimization,
--    add WITH CHECK, split FOR ALL into granular per-operation policies
-- =============================================================================
-- Problem: Original policies used FOR ALL without TO role and called auth.uid()
-- directly. Supabase docs show that wrapping in (select auth.uid()) prevents
-- re-evaluation per row (95%+ performance improvement). FOR ALL policies also
-- lack explicit WITH CHECK for INSERT/UPDATE, and missing TO causes policies
-- to be evaluated even for roles that don't need them.
-- Reference: https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select

-- ---- 4a. Drop existing carts policies ----
DROP POLICY IF EXISTS "Users manage own carts" ON carts;
DROP POLICY IF EXISTS "Anonymous users manage own carts by session" ON carts;

-- ---- 4b. Recreate carts policies with per-operation granularity ----

-- SELECT: authenticated users read their own carts
CREATE POLICY "carts_select_authenticated" ON carts
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

-- SELECT: anonymous users read their session-based carts
CREATE POLICY "carts_select_anon" ON carts
  FOR SELECT TO anon
  USING (session_id = (select auth.uid())::text);

-- INSERT: authenticated users create carts with their user_id
CREATE POLICY "carts_insert_authenticated" ON carts
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

-- INSERT: anonymous users create carts (user_id must be null, session_id must match)
CREATE POLICY "carts_insert_anon" ON carts
  FOR INSERT TO anon
  WITH CHECK (user_id IS NULL AND session_id = (select auth.uid())::text);

-- UPDATE: authenticated users update their own carts
CREATE POLICY "carts_update_authenticated" ON carts
  FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

-- UPDATE: anonymous users update their session-based carts
CREATE POLICY "carts_update_anon" ON carts
  FOR UPDATE TO anon
  USING (session_id = (select auth.uid())::text)
  WITH CHECK (session_id = (select auth.uid())::text);

-- DELETE: authenticated users delete their own carts
CREATE POLICY "carts_delete_authenticated" ON carts
  FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()));

-- DELETE: anonymous users delete their session-based carts
CREATE POLICY "carts_delete_anon" ON carts
  FOR DELETE TO anon
  USING (session_id = (select auth.uid())::text);

-- ---- 4c. Drop existing cart_items policies ----
DROP POLICY IF EXISTS "Cart items accessible by cart owner" ON cart_items;
DROP POLICY IF EXISTS "Cart items accessible by session" ON cart_items;

-- ---- 4d. Recreate cart_items policies ----
-- All cart_items policies check ownership through the parent carts table.

-- SELECT: authenticated users read items in their carts
CREATE POLICY "cart_items_select_authenticated" ON cart_items
  FOR SELECT TO authenticated
  USING (cart_id IN (SELECT id FROM carts WHERE user_id = (select auth.uid())));

-- SELECT: anonymous users read items in their session carts
CREATE POLICY "cart_items_select_anon" ON cart_items
  FOR SELECT TO anon
  USING (cart_id IN (SELECT id FROM carts WHERE session_id = (select auth.uid())::text));

-- INSERT: authenticated users add items to their carts
CREATE POLICY "cart_items_insert_authenticated" ON cart_items
  FOR INSERT TO authenticated
  WITH CHECK (cart_id IN (SELECT id FROM carts WHERE user_id = (select auth.uid())));

-- INSERT: anonymous users add items to their session carts
CREATE POLICY "cart_items_insert_anon" ON cart_items
  FOR INSERT TO anon
  WITH CHECK (cart_id IN (SELECT id FROM carts WHERE session_id = (select auth.uid())::text));

-- UPDATE: authenticated users update items in their carts
CREATE POLICY "cart_items_update_authenticated" ON cart_items
  FOR UPDATE TO authenticated
  USING (cart_id IN (SELECT id FROM carts WHERE user_id = (select auth.uid())))
  WITH CHECK (cart_id IN (SELECT id FROM carts WHERE user_id = (select auth.uid())));

-- UPDATE: anonymous users update items in their session carts
CREATE POLICY "cart_items_update_anon" ON cart_items
  FOR UPDATE TO anon
  USING (cart_id IN (SELECT id FROM carts WHERE session_id = (select auth.uid())::text))
  WITH CHECK (cart_id IN (SELECT id FROM carts WHERE session_id = (select auth.uid())::text));

-- DELETE: authenticated users delete items from their carts
CREATE POLICY "cart_items_delete_authenticated" ON cart_items
  FOR DELETE TO authenticated
  USING (cart_id IN (SELECT id FROM carts WHERE user_id = (select auth.uid())));

-- DELETE: anonymous users delete items from their session carts
CREATE POLICY "cart_items_delete_anon" ON cart_items
  FOR DELETE TO anon
  USING (cart_id IN (SELECT id FROM carts WHERE session_id = (select auth.uid())::text));

-- ---- 4e. Fix error_logs policies ----
-- The existing error_logs policies already have TO role and per-operation granularity.
-- Only fix: wrap auth.uid() in (select ...) for the users_read_own policy.
DROP POLICY IF EXISTS "users_read_own" ON error_logs;

CREATE POLICY "users_read_own" ON error_logs
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

-- =============================================================================
-- 5. CHECK constraint on carts.status
-- =============================================================================
-- Problem: status is a free TEXT column — any typo or invalid value is silently
-- accepted. A CHECK constraint enforces valid values at the database level.
-- Reference: Defense in depth — validate at DB level, not just application level.
ALTER TABLE carts ADD CONSTRAINT carts_status_check
  CHECK (status IN ('active', 'completed', 'abandoned', 'merged'));

-- =============================================================================
-- 6. Add updated_at column to cart_items
-- =============================================================================
-- Problem: cart_items has created_at but no updated_at, making it impossible to
-- know when a quantity or price was last changed. Reuses the trigger function
-- created in 20260316000000_enable_carts_realtime.sql.
ALTER TABLE cart_items
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

CREATE TRIGGER cart_items_updated_at
  BEFORE UPDATE ON cart_items
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- 7. Change REPLICA IDENTITY from FULL to DEFAULT on carts
-- =============================================================================
-- Problem: REPLICA IDENTITY FULL logs the entire old row on every UPDATE in the
-- WAL (Write-Ahead Log). Since we only use Realtime as a cache-invalidation
-- signal (the PK is all that's delivered through RLS-filtered channels), DEFAULT
-- (which sends just the PK) is sufficient and avoids unnecessary WAL bloat.
-- Reference: Supabase Realtime docs — use DEFAULT unless you need old row data.
ALTER TABLE carts REPLICA IDENTITY DEFAULT;
