-- M3: Order distributions — Violet's payment breakdown per order bag
--
-- Populated on-demand via GET /v1/orders/{id}/distributions (no Violet webhook).
-- The UNIQUE constraint on (violet_order_id, type, violet_bag_id) makes syncs
-- idempotent — same pattern as webhook_events.event_id.
--
-- Amounts are integer cents, matching Violet's format.

CREATE TABLE order_distributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_bag_id UUID NOT NULL REFERENCES order_bags(id) ON DELETE CASCADE,
  violet_order_id TEXT NOT NULL,
  violet_bag_id TEXT,
  type TEXT NOT NULL CHECK (type IN ('PAYMENT', 'REFUND', 'ADJUSTMENT')),
  status TEXT NOT NULL CHECK (status IN ('PENDING', 'QUEUED', 'SENT', 'FAILED')),
  channel_amount_cents INTEGER NOT NULL DEFAULT 0,
  stripe_fee_cents INTEGER NOT NULL DEFAULT 0,
  merchant_amount_cents INTEGER NOT NULL DEFAULT 0,
  subtotal_cents INTEGER NOT NULL DEFAULT 0,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (violet_order_id, type, violet_bag_id)
);

CREATE INDEX idx_order_distributions_order_bag ON order_distributions (order_bag_id);
CREATE INDEX idx_order_distributions_violet_order ON order_distributions (violet_order_id);

COMMENT ON TABLE order_distributions IS
  'Violet payment distributions per order bag. Synced on-demand via Violet Distributions API.';

-- RLS: only service_role can access (same as materialized views)
ALTER TABLE order_distributions ENABLE ROW LEVEL SECURITY;
-- No policies needed — service_role bypasses RLS by default
