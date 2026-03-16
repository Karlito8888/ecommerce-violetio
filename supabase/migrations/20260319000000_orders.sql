-- Story 5.1: Order Confirmation & Data Persistence
-- Orders + order_bags + order_items tables with RLS, indexes
--
-- ## Architecture Decision: Supabase as Violet Mirror
-- These tables mirror order data from the Violet.io commerce API. Violet remains
-- the source of truth — Supabase provides:
-- 1. Local queries for order history (user's "My Orders" page)
-- 2. Guest order lookup via hashed tokens (order_lookup_token_hash)
-- 3. Email delivery tracking (email_sent flag)
-- 4. Future webhook-driven status updates (Story 5.2)
--
-- ## RLS Design
-- - Authenticated users: SELECT only their own orders (user_id = auth.uid())
-- - Service role: full access (Edge Functions + Server Functions do all writes)
-- - Guest lookup: goes through Edge Function (service_role), NOT direct client access
--   → no anon/public policies needed
--
-- ## Monetary Values
-- All prices stored as INTEGER cents (not decimal) — matches Violet's format.
-- Use formatPrice(cents) from @ecommerce/shared for display.

-- Orders table: mirrors Violet order data in Supabase
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  violet_order_id TEXT NOT NULL UNIQUE,
  user_id UUID REFERENCES auth.users(id),
  session_id TEXT,
  email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PROCESSING',
  subtotal INTEGER NOT NULL,
  shipping_total INTEGER NOT NULL DEFAULT 0,
  tax_total INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  order_lookup_token_hash TEXT,
  email_sent BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Order bags: one row per merchant per order
CREATE TABLE order_bags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  violet_bag_id TEXT NOT NULL,
  merchant_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'IN_PROGRESS',
  financial_status TEXT NOT NULL DEFAULT 'UNPAID',
  subtotal INTEGER NOT NULL,
  shipping_total INTEGER NOT NULL DEFAULT 0,
  tax_total INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL,
  shipping_method TEXT,
  tracking_number TEXT,
  tracking_url TEXT,
  carrier TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Order items: individual SKUs within a bag
CREATE TABLE order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_bag_id UUID NOT NULL REFERENCES order_bags(id) ON DELETE CASCADE,
  sku_id TEXT NOT NULL,
  name TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  price INTEGER NOT NULL,
  line_price INTEGER NOT NULL,
  thumbnail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_orders_user_id ON orders(user_id);
CREATE INDEX idx_orders_session_id ON orders(session_id) WHERE session_id IS NOT NULL;
CREATE INDEX idx_orders_email ON orders(email);
CREATE INDEX idx_orders_lookup_token ON orders(order_lookup_token_hash) WHERE order_lookup_token_hash IS NOT NULL;
CREATE INDEX idx_order_bags_order_id ON order_bags(order_id);
CREATE INDEX idx_order_bags_violet_bag_id ON order_bags(violet_bag_id);
CREATE INDEX idx_order_items_order_bag_id ON order_items(order_bag_id);

-- RLS policies
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_bags ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read their own orders
CREATE POLICY "users_read_own_orders" ON orders
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Service role can do everything (Edge Functions, Server Functions)
CREATE POLICY "service_role_all_orders" ON orders
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Order bags: accessible if parent order is accessible
CREATE POLICY "users_read_own_order_bags" ON order_bags
  FOR SELECT TO authenticated
  USING (order_id IN (SELECT id FROM orders WHERE user_id = auth.uid()));

CREATE POLICY "service_role_all_order_bags" ON order_bags
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Order items: accessible if parent bag is accessible
CREATE POLICY "users_read_own_order_items" ON order_items
  FOR SELECT TO authenticated
  USING (order_bag_id IN (
    SELECT ob.id FROM order_bags ob
    JOIN orders o ON ob.order_id = o.id
    WHERE o.user_id = auth.uid()
  ));

CREATE POLICY "service_role_all_order_items" ON order_items
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Updated_at trigger — function already exists from 20260316000000_enable_carts_realtime.sql
-- CREATE OR REPLACE is intentional for idempotency
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER order_bags_updated_at
  BEFORE UPDATE ON order_bags
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
