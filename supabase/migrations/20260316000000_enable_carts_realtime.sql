-- Migration: Enable Realtime on carts table + updated_at trigger
-- Story 4.6 — Cross-Device Cart Sync
-- Timestamp: 20260316000000

-- Enable Realtime so carts table changes are broadcast via WebSocket.
-- Used by useCartSync hook to detect cross-device cart modifications.
ALTER PUBLICATION supabase_realtime ADD TABLE carts;

-- REPLICA IDENTITY FULL sends old+new row data on UPDATE events.
-- With RLS enabled, Realtime only delivers the primary key to clients,
-- so we use the event as a cache-invalidation signal (not as data source).
ALTER TABLE carts REPLICA IDENTITY FULL;

-- Auto-update updated_at on any carts row modification.
-- This ensures Realtime fires on every cart mutation, even when the
-- mutation only changes cart_items (the trigger fires on carts row update).
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER carts_updated_at
  BEFORE UPDATE ON carts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Document the new 'merged' status used during anonymous→authenticated cart merge.
-- status is TEXT (no enum constraint), so no ALTER TYPE needed.
COMMENT ON COLUMN carts.status IS 'active | completed | abandoned | merged';
