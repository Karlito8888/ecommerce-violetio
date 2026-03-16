-- Migration: order_refunds table
-- Story 5.5: Refund Processing & Communication
--
-- Stores refund details fetched from the Violet.io Refund API:
--   GET /v1/orders/{order_id}/bags/{bag_id}/refunds
--
-- ## Why a separate table?
-- Violet webhooks (BAG_REFUNDED) only notify that a refund occurred — they do NOT
-- include the refund amount or reason. These details are fetched from the Violet
-- Refund API and persisted here for display in the order detail views.
-- See: https://docs.violet.io/prism/webhooks/events/order-webhooks.md
--
-- ## CANCELED ≠ REFUNDED (Violet semantics)
-- Per Violet docs, CANCELED is merchant-initiated rejection WITHOUT automatic refund.
-- REFUNDED/PARTIALLY_REFUNDED confirm actual monetary transactions occurred.
-- A CANCELED bag will never have rows in this table.
-- See: https://docs.violet.io/prism/checkout-guides/guides/order-and-bag-states.md
--
-- ## Immutability
-- Refunds are immutable once created — no updated_at column or trigger needed.
--
-- ## Idempotency
-- violet_refund_id is UNIQUE so upserts on repeated webhook deliveries are safe.

CREATE TABLE order_refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_bag_id UUID NOT NULL REFERENCES order_bags(id) ON DELETE CASCADE,
  violet_refund_id TEXT NOT NULL UNIQUE,
  amount INTEGER NOT NULL,
  reason TEXT,
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'PROCESSED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_order_refunds_order_bag_id ON order_refunds(order_bag_id);

-- ── Row Level Security ──────────────────────────────────────────────────────

ALTER TABLE order_refunds ENABLE ROW LEVEL SECURITY;

-- service_role (Edge Functions, webhooks) has full access
CREATE POLICY "service_role_all_order_refunds" ON order_refunds
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Authenticated users can read their own bag refunds (join through order_bags → orders)
CREATE POLICY "users_read_own_order_refunds" ON order_refunds
  FOR SELECT TO authenticated
  USING (order_bag_id IN (
    SELECT ob.id FROM order_bags ob
    JOIN orders o ON ob.order_id = o.id
    WHERE o.user_id = auth.uid()
  ));

-- ── Realtime ────────────────────────────────────────────────────────────────
-- Adding to supabase_realtime publication allows the existing useOrderRealtime hook
-- (which subscribes to order_bags UPDATEs) to indirectly trigger re-fetches when
-- refunds are inserted, since the hook invalidates the full order query.

ALTER PUBLICATION supabase_realtime ADD TABLE order_refunds;
