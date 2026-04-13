-- Migration: Enrich collections with handle, image_alt from Violet API
-- These fields were missing from the original migration but are part of
-- the Violet Collection model.
-- @see https://docs.violet.io/api-reference/catalog/collections

-- Add handle column (URL-friendly slug from e-commerce platform)
ALTER TABLE public.collections ADD COLUMN IF NOT EXISTS handle VARCHAR;
COMMENT ON COLUMN public.collections.handle IS
  'URL-friendly slug from the e-commerce platform (e.g., "summer-sale"). Used for SEO-friendly collection URLs.';

-- Add image_alt column (alt text from collection media)
ALTER TABLE public.collections ADD COLUMN IF NOT EXISTS image_alt TEXT;
COMMENT ON COLUMN public.collections.image_alt IS
  'Alt text for the collection image, sourced from Violet media.alt.';

-- Backfill handle from existing external_id where handle is NULL
-- Shopify collections often have the handle as part of their data,
-- but since we didn't store it before, we set a sensible default.
UPDATE public.collections SET handle = LOWER(REPLACE(name, ' ', '-'))
WHERE handle IS NULL AND name IS NOT NULL;
