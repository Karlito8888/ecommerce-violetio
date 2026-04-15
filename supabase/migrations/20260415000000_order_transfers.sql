-- Migration: order_transfers table
--
-- Stores Violet Transfer objects for monitoring failed/successful payouts.
-- Populated via webhooks (TRANSFER_FAILED/SENT/REVERSED) and on-demand sync.
--
-- Amounts are integer cents, matching Violet's format.

CREATE TABLE order_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  violet_transfer_id TEXT NOT NULL,
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  violet_order_id TEXT NOT NULL,
  violet_bag_id TEXT,
  merchant_id TEXT NOT NULL,
  payment_provider_transfer_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('PENDING', 'SENT', 'FAILED', 'PARTIALLY_SENT', 'REVERSED', 'PARTIALLY_REVERSED', 'BYPASSED')),
  amount_cents INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  errors JSONB,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (violet_transfer_id)
);

CREATE INDEX idx_order_transfers_order ON order_transfers (order_id);
CREATE INDEX idx_order_transfers_violet_order ON order_transfers (violet_order_id);
CREATE INDEX idx_order_transfers_status ON order_transfers (status);
CREATE INDEX idx_order_transfers_merchant ON order_transfers (merchant_id);

COMMENT ON TABLE order_transfers IS
  'Violet Transfer objects — fund movement from platform to merchant. Used for monitoring failed transfers and retrying.';

-- RLS: only service_role can access (same as order_distributions)
ALTER TABLE order_transfers ENABLE ROW LEVEL SECURITY;
-- No policies needed — service_role bypasses RLS by default
