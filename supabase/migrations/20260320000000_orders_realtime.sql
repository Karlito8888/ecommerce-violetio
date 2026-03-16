-- Migration: Enable Realtime on orders and order_bags tables
-- Story 5.2 — Order Status Webhooks Processing
-- Timestamp: 20260320000000

-- Enable Realtime so order status changes are broadcast via WebSocket.
-- Webhook processors update these tables → Realtime fires automatically.
-- Clients subscribe to postgres_changes on orders/order_bags filtered by user_id.
ALTER PUBLICATION supabase_realtime ADD TABLE orders;
ALTER PUBLICATION supabase_realtime ADD TABLE order_bags;

-- DEFAULT replica identity — PK in WAL is sufficient for cache-invalidation.
-- Avoids WAL bloat from FULL (which logs entire old row on every UPDATE).
-- Same decision as carts table (20260318000000_epic4_review_fixes.sql).
-- Clients use Realtime as a signal to re-fetch, not as a data source.
ALTER TABLE orders REPLICA IDENTITY DEFAULT;
ALTER TABLE order_bags REPLICA IDENTITY DEFAULT;
