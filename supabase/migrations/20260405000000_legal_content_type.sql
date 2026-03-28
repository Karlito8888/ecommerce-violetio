-- Story 8.6: Legal & Compliance Pages
-- Extends content_page_type enum with 'legal'.
-- NOTE: ALTER TYPE ... ADD VALUE cannot run in the same transaction as
-- statements that use the new value. The seed INSERT statements are in
-- the next migration file (20260405000001_legal_content_seed.sql).

ALTER TYPE public.content_page_type ADD VALUE IF NOT EXISTS 'legal';
