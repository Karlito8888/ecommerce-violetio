-- Migration: Add fulfillment_status column to order_bags
-- Timestamp: 20260414134153
--
-- Per Violet docs, each Bag has 3 independent status dimensions:
--   1. `status` (BagStatus) — overall bag lifecycle (IN_PROGRESS → COMPLETED)
--   2. `financial_status` (FinancialStatus) — payment state (UNPAID → PAID)
--   3. `fulfillment_status` (FulfillmentStatus) — delivery state (PROCESSING → DELIVERED)
--
-- Previously we only captured #1 and #2. This migration adds #3.
--
-- The 6 Violet FulfillmentStatus values:
--   PROCESSING        — bag not yet fulfilled
--   SHIPPED           — all items fulfilled
--   PARTIALLY_SHIPPED — some items fulfilled
--   DELIVERED         — all items delivered
--   COULD_NOT_DELIVER — delivery failed
--   RETURNED          — all items returned
--
-- @see https://docs.violet.io/prism/checkout-guides/carts-and-bags/bags/states-of-a-bag

-- =============================================================================
-- 1. Add fulfillment_status column
-- =============================================================================
ALTER TABLE order_bags
  ADD COLUMN IF NOT EXISTS fulfillment_status TEXT NOT NULL DEFAULT 'PROCESSING';

-- =============================================================================
-- 2. CHECK constraint for valid values
-- =============================================================================
ALTER TABLE order_bags ADD CONSTRAINT order_bags_fulfillment_status_check
  CHECK (fulfillment_status IN (
    'PROCESSING',
    'SHIPPED',
    'PARTIALLY_SHIPPED',
    'DELIVERED',
    'COULD_NOT_DELIVER',
    'RETURNED'
  ));

-- =============================================================================
-- 3. Backfill existing rows based on current status
-- =============================================================================
-- Existing bags: derive fulfillment_status from the bag status we already have.
-- This is a best-effort heuristic — not perfect but better than all PROCESSING.
UPDATE order_bags
SET fulfillment_status = CASE
    WHEN status = 'COMPLETED' THEN 'DELIVERED'
    WHEN status = 'SHIPPED' THEN 'SHIPPED'
    WHEN status = 'REFUNDED' THEN 'RETURNED'
    WHEN status = 'PARTIALLY_REFUNDED' THEN 'RETURNED'
    WHEN status = 'CANCELED' THEN 'PROCESSING'
    WHEN status = 'REJECTED' THEN 'PROCESSING'
    ELSE 'PROCESSING'
  END
WHERE fulfillment_status = 'PROCESSING'
  AND status != 'IN_PROGRESS';
