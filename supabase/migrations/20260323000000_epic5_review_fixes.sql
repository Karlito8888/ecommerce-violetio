-- Migration: Epic 5 code review fixes
-- Addresses two findings from the Epic 5 review:
--   1. Missing UNIQUE constraint on order_bags.violet_bag_id
--   2. Missing composite index on orders(user_id, created_at DESC)
--
-- ## Fix 1: UNIQUE constraint on order_bags.violet_bag_id
--
-- Review finding: webhook processors (orderProcessors.ts) perform lookups and
-- updates via `.eq("violet_bag_id", ...)` which implicitly assumes uniqueness.
-- Without a UNIQUE constraint, a duplicate violet_bag_id could silently update
-- multiple rows (Supabase/PostgREST returns the first match with .single()).
--
-- Violet bag IDs are globally unique within Violet's system — each bag belongs
-- to exactly one order. Enforcing this at the DB level:
--   - Prevents data corruption from duplicate inserts (e.g., retried checkout flow)
--   - Enables safe `.single()` calls in processBagUpdated, processBagShipped,
--     processBagRefunded without risking PGRST116 ambiguity errors
--   - Replaces the existing non-unique idx_order_bags_violet_bag_id index
--     (the UNIQUE constraint creates an implicit unique index)
--
-- @see supabase/functions/handle-webhook/orderProcessors.ts — all bag processors
-- @see 20260319000000_orders.sql — original schema (line 98: non-unique index)

-- Drop the existing non-unique index first (replaced by the UNIQUE constraint's
-- implicit index, which serves the same lookup purpose + enforces uniqueness)
DROP INDEX IF EXISTS idx_order_bags_violet_bag_id;

ALTER TABLE order_bags
  ADD CONSTRAINT uq_order_bags_violet_bag_id UNIQUE (violet_bag_id);

-- ## Fix 2: Composite index on orders(user_id, created_at DESC)
--
-- Review finding: the "My Orders" page queries
--   `SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC`
-- The existing idx_orders_user_id index covers the WHERE clause but not the
-- ORDER BY, forcing a separate sort step. This composite index eliminates
-- the sort entirely — Postgres can satisfy both filter and ordering from
-- a single B-tree scan.
--
-- The existing idx_orders_user_id is kept because RLS policies reference
-- user_id alone (WHERE user_id = auth.uid()). Postgres may choose either
-- index depending on query shape. If monitoring shows idx_orders_user_id
-- is never used after this migration, it can be safely dropped.

CREATE INDEX idx_orders_user_id_created_at
  ON orders(user_id, created_at DESC);
