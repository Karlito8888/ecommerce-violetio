-- Migration: add country_code to merchants table
--
-- Stores the merchant's default country code from Violet (e.g., "US", "GB", "DE").
-- Used for cross-border detection on checkout — when shipping address country differs
-- from the merchant's country, a duties warning is displayed.
--
-- Populated via GET /merchants API (default_country_code field) or webhook enrichment.

ALTER TABLE public.merchants
  ADD COLUMN country_code TEXT;

COMMENT ON COLUMN public.merchants.country_code IS
  'Merchant default country code (ISO 3166-1 alpha-2) from Violet. Used for cross-border duty detection.';
