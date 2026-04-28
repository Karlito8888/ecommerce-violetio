-- Migration: add merchant_id to product_embeddings
--
-- Enables batch soft-delete of a disconnected merchant's products
-- (MERCHANT_DISCONNECTED webhook) instead of waiting for individual
-- OFFER_REMOVED webhooks for each product.
--
-- Also enables merchant-level filtering in search RPC if needed.
--
-- @see https://docs.violet.io/prism/merchants/merchant-app-connections

ALTER TABLE public.product_embeddings
  ADD COLUMN merchant_id TEXT;

-- Index for efficient batch lookups by merchant
CREATE INDEX idx_product_embeddings_merchant_id
  ON public.product_embeddings (merchant_id)
  WHERE merchant_id IS NOT NULL;

COMMENT ON COLUMN public.product_embeddings.merchant_id IS
  'Violet merchant ID (FK to merchants.merchant_id). Set during embedding generation from webhook payload. Used for batch soft-delete on merchant disconnection.';
