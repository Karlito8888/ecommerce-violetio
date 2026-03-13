-- Migration: add product availability
-- Story 3.7: Product Catalog Sync via Webhooks
-- Adds availability tracking to product_embeddings for webhook-driven catalog sync.
--
-- Design decisions:
--   • `available` defaults to TRUE so existing embeddings remain searchable.
--   • `source` defaults to 'violet' — prepares for multi-supplier support
--     without requiring changes when a second supplier is added.
--   • match_products RPC updated with `pe.available = true` filter so removed/deleted
--     products are automatically excluded from AI search results.

-- Add availability flag (OFFER_REMOVED/DELETED sets this to false)
ALTER TABLE public.product_embeddings
  ADD COLUMN available BOOLEAN NOT NULL DEFAULT true;

-- Add source column for future multi-supplier support
ALTER TABLE public.product_embeddings
  ADD COLUMN source VARCHAR DEFAULT 'violet';

-- Replace match_products RPC to filter out unavailable products
CREATE OR REPLACE FUNCTION public.match_products(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.3,
  match_count int DEFAULT 12
)
RETURNS TABLE (
  product_id VARCHAR,
  product_name TEXT,
  text_content TEXT,
  similarity float
)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT
    pe.product_id,
    pe.product_name,
    pe.text_content,
    1 - (pe.embedding <=> query_embedding) AS similarity
  FROM public.product_embeddings pe
  WHERE 1 - (pe.embedding <=> query_embedding) > match_threshold
    AND pe.available = true
  ORDER BY pe.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

COMMENT ON FUNCTION public.match_products IS
  'Returns available products ordered by cosine similarity to a query embedding vector. '
  'Excludes products marked as unavailable (available = false) by webhook sync.';
