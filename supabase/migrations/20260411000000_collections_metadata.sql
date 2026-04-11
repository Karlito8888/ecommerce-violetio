-- Migration: Collections & Metadata support
-- Stores merchant collections synced from Violet.io (Shopify merchants)
-- and tracks which feature flags are enabled per merchant.

-- ─── Collections ──────────────────────────────────────────────────────

CREATE TABLE public.collections (
  id           VARCHAR     PRIMARY KEY,   -- Violet collection ID (string cast from number)
  merchant_id  VARCHAR     NOT NULL,
  name         TEXT        NOT NULL,
  description  TEXT,
  type         VARCHAR     NOT NULL DEFAULT 'CUSTOM',  -- CUSTOM | AUTOMATED
  external_id  VARCHAR,    -- ID from the e-commerce platform
  status       VARCHAR     NOT NULL DEFAULT 'ACTIVE',  -- ACTIVE | REMOVED
  image_url    TEXT,
  sort_order   INT         NOT NULL DEFAULT 0,
  date_created   TIMESTAMPTZ NOT NULL DEFAULT now(),
  date_last_modified TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fetching collections by merchant
CREATE INDEX idx_collections_merchant_id ON public.collections (merchant_id);

-- Auto-update updated_at on row change
CREATE TRIGGER collections_updated_at
  BEFORE UPDATE ON public.collections
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Enable Row-Level Security
ALTER TABLE public.collections ENABLE ROW LEVEL SECURITY;

-- Read access for all (anon + authenticated)
CREATE POLICY "collections_read_all" ON public.collections
  FOR SELECT USING (true);

-- Write access restricted to service_role only (Edge Functions)
-- No INSERT/UPDATE/DELETE policy for anon/authenticated = implicit deny

-- ─── Collection ↔ Offer junction ──────────────────────────────────────

CREATE TABLE public.collection_offers (
  collection_id VARCHAR NOT NULL REFERENCES public.collections(id) ON DELETE CASCADE,
  offer_id      VARCHAR NOT NULL,
  date_added    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (collection_id, offer_id)
);

CREATE INDEX idx_collection_offers_offer_id ON public.collection_offers (offer_id);

-- Enable Row-Level Security
ALTER TABLE public.collection_offers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "collection_offers_read_all" ON public.collection_offers
  FOR SELECT USING (true);

-- ─── Merchant Feature Flags ──────────────────────────────────────────
-- Tracks which Violet feature flags are enabled per merchant.
-- Used to know what data is available and to auto-enable on merchant connect.

CREATE TABLE public.merchant_feature_flags (
  merchant_id  VARCHAR NOT NULL,
  flag_name    VARCHAR NOT NULL,
  enabled      BOOLEAN NOT NULL DEFAULT true,
  date_enabled TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (merchant_id, flag_name)
);

CREATE INDEX idx_merchant_feature_flags_merchant ON public.merchant_feature_flags (merchant_id);

ALTER TABLE public.merchant_feature_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "merchant_feature_flags_read_all" ON public.merchant_feature_flags
  FOR SELECT USING (true);

COMMENT ON TABLE public.collections IS
  'Merchant product collections synced from Violet.io. Shop-only (Shopify merchants).';
COMMENT ON TABLE public.collection_offers IS
  'Junction table linking collections to offers (products). Many-to-many.';
COMMENT ON TABLE public.merchant_feature_flags IS
  'Tracks which Violet feature flags are enabled per merchant (sync_collections, sync_metadata, sync_sku_metadata).';
