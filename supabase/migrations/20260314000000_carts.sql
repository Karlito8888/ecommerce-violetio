-- Migration: carts & cart_items tables
-- Story 4.1 — Cart Creation & Item Management
-- Timestamp: 20260314000000

CREATE TABLE IF NOT EXISTS carts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  violet_cart_id TEXT NOT NULL UNIQUE,
  user_id        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id     TEXT,           -- for anonymous guests
  status         TEXT NOT NULL DEFAULT 'active', -- active | completed | abandoned
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT carts_has_owner CHECK (user_id IS NOT NULL OR session_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS cart_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id     UUID NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  sku_id      TEXT NOT NULL,
  quantity    INT NOT NULL CHECK (quantity >= 1),
  unit_price  INT NOT NULL,  -- in cents
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE cart_items ENABLE ROW LEVEL SECURITY;

-- Authenticated users manage their own carts
CREATE POLICY "Users manage own carts"
  ON carts FOR ALL
  USING (auth.uid() = user_id);

-- Anonymous guest carts: matched by session_id (no auth.uid())
-- The app sets session_id = supabase anonymous user id
CREATE POLICY "Anonymous users manage own carts by session"
  ON carts FOR ALL
  USING (session_id = auth.uid()::text);

-- Cart items accessible by the cart owner (authenticated)
CREATE POLICY "Cart items accessible by cart owner"
  ON cart_items FOR ALL
  USING (
    cart_id IN (SELECT id FROM carts WHERE auth.uid() = user_id)
  );

-- Cart items accessible by anonymous session
CREATE POLICY "Cart items accessible by session"
  ON cart_items FOR ALL
  USING (
    cart_id IN (SELECT id FROM carts WHERE session_id = auth.uid()::text)
  );

-- Index for fast cart lookup by violet_cart_id (used on every cart operation)
CREATE INDEX IF NOT EXISTS idx_carts_violet_cart_id ON carts (violet_cart_id);

-- Index for user cart lookups
CREATE INDEX IF NOT EXISTS idx_carts_user_id ON carts (user_id) WHERE user_id IS NOT NULL;

-- Index for session cart lookups
CREATE INDEX IF NOT EXISTS idx_carts_session_id ON carts (session_id) WHERE session_id IS NOT NULL;
