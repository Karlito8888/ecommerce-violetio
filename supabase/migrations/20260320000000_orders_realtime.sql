-- Migration: Enable Realtime on orders and order_bags tables
-- Story 5.2 — Order Status Webhooks Processing
-- Timestamp: 20260320000000
--
-- ## How Realtime fits the order tracking flow:
-- 1. Violet sends webhook (ORDER_UPDATED, BAG_SHIPPED, etc.)
-- 2. handle-webhook Edge Function updates orders/order_bags tables
-- 3. Supabase Realtime detects the row change via WAL
-- 4. Client's useOrderRealtime hook receives the change event
-- 5. Client invalidates TanStack Query cache → re-fetches fresh data from server
--
-- ## Why NOT REPLICA IDENTITY FULL?
-- FULL logs the entire old row in WAL on every UPDATE, increasing WAL size.
-- DEFAULT only logs the PK, which is sufficient since clients treat Realtime
-- as a cache-invalidation signal (they re-fetch, not read from the event payload).
-- Same decision as carts table (20260318000000_epic4_review_fixes.sql).
--
-- ## RLS + Realtime interaction
-- Supabase Realtime respects RLS policies — authenticated users only receive
-- change events for rows matching their RLS filter (user_id = auth.uid()).
-- This means no additional authorization is needed on the Realtime subscription.

ALTER PUBLICATION supabase_realtime ADD TABLE orders;
ALTER PUBLICATION supabase_realtime ADD TABLE order_bags;

ALTER TABLE orders REPLICA IDENTITY DEFAULT;
ALTER TABLE order_bags REPLICA IDENTITY DEFAULT;
