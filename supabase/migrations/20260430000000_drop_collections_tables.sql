-- Migration: Drop collections tables — data fetched directly from Violet API
-- Collections are no longer stored locally. Both web and mobile call Violet API directly.
-- The collection webhook processors are now no-op (acknowledge only).

DROP TABLE IF EXISTS public.collection_offers;
DROP TABLE IF EXISTS public.collections;
