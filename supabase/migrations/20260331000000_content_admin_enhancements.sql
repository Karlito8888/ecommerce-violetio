-- Story 7.6: Content Administration via Supabase Studio (MVP)
-- Adds admin-facing columns, column comments for Studio tooltips,
-- CHECK constraints, and sort_order index.
-- All changes are additive — existing data is unaffected.

-- ─── New columns ───
ALTER TABLE public.content_pages ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
ALTER TABLE public.content_pages ADD COLUMN IF NOT EXISTS related_slugs TEXT[] DEFAULT '{}';
ALTER TABLE public.content_pages ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;

-- ─── Column comments (visible as tooltips in Supabase Studio Table Editor) ───
COMMENT ON COLUMN public.content_pages.slug IS 'URL-safe identifier. Use lowercase-with-hyphens. Example: best-running-shoes-2026';
COMMENT ON COLUMN public.content_pages.title IS 'Display title. Must not be empty.';
COMMENT ON COLUMN public.content_pages.status IS 'draft = not visible, published = visible to visitors (if published_at <= now), archived = hidden';
COMMENT ON COLUMN public.content_pages.body_markdown IS 'Markdown content. Embed products with {{product:VIOLET_OFFER_ID}}. Internal links: [text](/products/ID) or [text](/content/slug)';
COMMENT ON COLUMN public.content_pages.author IS 'Author display name shown on the article page.';
COMMENT ON COLUMN public.content_pages.published_at IS 'Set to a future date for scheduled publishing. Must be set when status = published.';
COMMENT ON COLUMN public.content_pages.related_slugs IS 'Array of slugs for related content links at bottom of article. Example: {best-value-shoes,shoe-care-guide}';
COMMENT ON COLUMN public.content_pages.sort_order IS '0 = default chronological. Higher values appear first in listings. Use 100+ for featured content.';
COMMENT ON COLUMN public.content_pages.tags IS 'Tags for categorization. Example: {running,shoes,guide}. Not displayed on frontend for MVP.';
COMMENT ON COLUMN public.content_pages.seo_title IS 'Custom page title for search engines. Falls back to title if empty.';
COMMENT ON COLUMN public.content_pages.seo_description IS 'Custom meta description for search engines. Falls back to first 160 chars of content.';
COMMENT ON COLUMN public.content_pages.featured_image_url IS 'Full URL to hero image. Used in article header and social previews (og:image).';

-- ─── CHECK constraints ───
ALTER TABLE public.content_pages ADD CONSTRAINT chk_slug_format
  CHECK (slug ~ '^[a-z0-9][a-z0-9-]*[a-z0-9]$');

ALTER TABLE public.content_pages ADD CONSTRAINT chk_title_not_empty
  CHECK (char_length(trim(title)) > 0);

ALTER TABLE public.content_pages ADD CONSTRAINT chk_published_has_date
  CHECK (status != 'published' OR published_at IS NOT NULL);

-- ─── Index for sort_order listing performance ───
CREATE INDEX IF NOT EXISTS idx_content_pages_sort_order
  ON public.content_pages(sort_order DESC, published_at DESC)
  WHERE status = 'published';
