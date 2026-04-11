-- Merchants table: centralized source of truth for connected merchants
--
-- Previously, merchant data was scattered across:
--   - webhook_events.entity_id (ephemeral, mixed with all event types)
--   - merchant_feature_flags.merchant_id (only flags, no name/platform)
--   - error_logs.context JSON blob (not queryable, structured as logs)
--   - order_bags.merchant_name (duplicated per order, no FK)
--
-- This table consolidates merchant info, populated by MERCHANT_CONNECTED webhook
-- and updated by MERCHANT_DISCONNECTED / MERCHANT_ENABLED / MERCHANT_DISABLED webhooks.
--
-- ## Why merchant_id as TEXT (not INT)?
-- Violet returns numeric IDs but our webhook/DB convention is to store them as strings
-- (same as violet_order_id, violet_bag_id, etc.) for consistency and to avoid
-- PostgreSQL integer overflow if Violet ever uses large IDs.
--
-- ## Commission rate
-- Stored as DECIMAL(5,4) — e.g., 0.1200 = 12%. Populated from the MERCHANT_CONNECTED
-- webhook payload if available, or from Violet's merchant API. Nullable because
-- Violet may not include it in the webhook payload.

CREATE TABLE public.merchants (
  merchant_id    TEXT PRIMARY KEY,            -- Violet merchant ID (string cast from number)
  name           TEXT NOT NULL DEFAULT 'Unknown',
  platform       TEXT,                        -- SHOPIFY, BIGCOMMERCE, etc. (from source field)
  status         TEXT NOT NULL DEFAULT 'CONNECTED',
  -- CONNECTED | DISCONNECTED | ENABLED | DISABLED
  commission_rate DECIMAL(5,4),              -- e.g. 0.1200 = 12%, nullable (may not be in webhook)
  connected_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_merchants_status ON public.merchants (status);
CREATE INDEX idx_merchants_platform ON public.merchants (platform);

-- Auto-update updated_at on row change
CREATE TRIGGER merchants_updated_at
  BEFORE UPDATE ON public.merchants
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable Row-Level Security
ALTER TABLE public.merchants ENABLE ROW LEVEL SECURITY;

-- Read access for all (anon + authenticated) — merchant names shown on product pages
CREATE POLICY "merchants_read_all" ON public.merchants
  FOR SELECT USING (true);

-- Write access restricted to service_role only (Edge Functions)
-- No INSERT/UPDATE/DELETE policy for anon/authenticated = implicit deny

COMMENT ON TABLE public.merchants IS
  'Connected merchants synced from Violet.io via MERCHANT_CONNECTED webhook. Central source of truth for merchant info.';

-- ─── Add merchant_id to order_bags ──────────────────────────────────────
-- Currently order_bags only has merchant_name (TEXT), which is fragile if a
-- merchant changes their name. Adding merchant_id enables proper FK joins to
-- the merchants table and makes commission tracking robust.

ALTER TABLE public.order_bags
  ADD COLUMN merchant_id TEXT;

-- Backfill merchant_id from existing merchants table data where possible
-- (This is best-effort — merchant_id may be NULL for historical bags
-- created before the merchants table existed.)
-- Nota: no direct backfill possible from existing data since we don't have
-- merchant_id in order_bags yet. Will be populated on new orders.

CREATE INDEX idx_order_bags_merchant_id ON public.order_bags (merchant_id)
  WHERE merchant_id IS NOT NULL;

COMMENT ON COLUMN public.order_bags.merchant_id IS
  'FK to merchants.merchant_id. Populated at order creation time from Violet bag data.';

-- ─── Recreate commission views with merchant_id join ─────────────────────
-- Replace GROUP BY merchant_name with GROUP BY merchant_id for robust commission
-- tracking (merchant_name can change, merchant_id is stable).

DROP MATERIALIZED VIEW IF EXISTS public.mv_commission_summary;

CREATE MATERIALIZED VIEW public.mv_commission_summary AS
SELECT
  COALESCE(m.merchant_id, ob.merchant_id) AS merchant_id,
  COALESCE(m.name, ob.merchant_name, 'Unknown') AS merchant_name,
  COUNT(DISTINCT ob.id) AS bag_count,
  COALESCE(SUM(ob.subtotal), 0) AS gross_subtotal_cents,
  COALESCE(SUM(public.estimate_commission(ob.subtotal, ob.commission_rate)), 0) AS commission_estimate_cents,
  AVG(ob.commission_rate) AS commission_rate_pct,
  now() AS refreshed_at
FROM order_bags ob
JOIN orders o ON ob.order_id = o.id
LEFT JOIN merchants m ON ob.merchant_id = m.merchant_id
WHERE o.status NOT IN ('CANCELED', 'REJECTED')
  AND ob.financial_status IN ('PAID', 'PARTIALLY_PAID')
GROUP BY COALESCE(m.merchant_id, ob.merchant_id), COALESCE(m.name, ob.merchant_name, 'Unknown');

-- Unique index for CONCURRENTLY refresh
CREATE UNIQUE INDEX idx_mv_commission_summary_merchant_id
  ON public.mv_commission_summary (merchant_id);

-- Restore access control
ALTER MATERIALIZED VIEW public.mv_commission_summary OWNER TO postgres;
REVOKE SELECT ON public.mv_commission_summary FROM PUBLIC;
REVOKE SELECT ON public.mv_commission_summary FROM authenticated;
REVOKE SELECT ON public.mv_commission_summary FROM anon;
