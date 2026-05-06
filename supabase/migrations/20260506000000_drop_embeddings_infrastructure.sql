-- Migration: drop OpenAI embeddings infrastructure
-- Removes product_embeddings table, match_products RPC, and pgvector extension.
-- OpenAI embeddings / semantic search has been removed from the project.

-- Drop the RPC function first (depends on the table)
DROP FUNCTION IF EXISTS public.match_products;

-- Drop the personalization function (was used by search-products / get-recommendations)
DROP FUNCTION IF EXISTS public.get_user_search_profile;

-- Drop the product_embeddings table
DROP TABLE IF EXISTS public.product_embeddings;

-- Drop the pgvector extension (no longer needed)
DROP EXTENSION IF EXISTS vector;
