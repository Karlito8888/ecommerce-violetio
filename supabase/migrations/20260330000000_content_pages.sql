-- Story 7.1: Editorial Content Pages
-- Creates content_pages table for editorial content (guides, comparisons, reviews).
-- Public read for published content, service_role full access.

-- ─── Enums ───
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'content_page_type') THEN
    CREATE TYPE public.content_page_type AS ENUM ('guide', 'comparison', 'review');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'content_page_status') THEN
    CREATE TYPE public.content_page_status AS ENUM ('draft', 'published', 'archived');
  END IF;
END $$;

-- ─── content_pages table ───
CREATE TABLE IF NOT EXISTS public.content_pages (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug               TEXT UNIQUE NOT NULL,
  title              TEXT NOT NULL,
  type               content_page_type NOT NULL DEFAULT 'guide',
  body_markdown      TEXT NOT NULL DEFAULT '',
  author             TEXT NOT NULL DEFAULT '',
  published_at       TIMESTAMPTZ,
  seo_title          TEXT,
  seo_description    TEXT,
  featured_image_url TEXT,
  status             content_page_status NOT NULL DEFAULT 'draft',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Indexes ───
CREATE INDEX IF NOT EXISTS idx_content_pages_slug ON public.content_pages(slug);
CREATE INDEX IF NOT EXISTS idx_content_pages_type ON public.content_pages(type);
CREATE INDEX IF NOT EXISTS idx_content_pages_status_published
  ON public.content_pages(status, published_at DESC)
  WHERE status = 'published';

-- ─── updated_at trigger (reuse existing function) ───
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'set_updated_at_content_pages'
  ) THEN
    CREATE TRIGGER set_updated_at_content_pages
      BEFORE UPDATE ON public.content_pages
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- ─── RLS ───
ALTER TABLE public.content_pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_read_published_content" ON public.content_pages
  FOR SELECT TO anon, authenticated
  USING (status = 'published' AND published_at <= now());

CREATE POLICY "service_role_all_content" ON public.content_pages
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- ─── Seed data for development/testing ───
INSERT INTO public.content_pages (slug, title, type, body_markdown, author, published_at, seo_title, seo_description, featured_image_url, status)
VALUES (
  'best-running-shoes-2026',
  'Best Running Shoes of 2026: A Comprehensive Guide',
  'guide',
  '## Introduction

Finding the perfect running shoe can be overwhelming. In this guide, we break down the top picks for 2026 across different categories — from daily trainers to race-day speedsters.

## Top Picks

### Best Overall: The CloudStride Pro

The CloudStride Pro offers an exceptional blend of cushioning and responsiveness. Its nitrogen-infused midsole provides energy return that rivals shoes costing twice as much.

**Key features:**
- Nitrogen-infused midsole for superior energy return
- Engineered mesh upper for breathability
- Carbon fiber plate for propulsion
- 8mm heel-to-toe drop

### Best Value: The TrailBlazer 5

For runners on a budget, the TrailBlazer 5 delivers remarkable performance at an accessible price point.

> "The TrailBlazer 5 punches well above its weight class." — Running Magazine

## How to Choose

When selecting running shoes, consider:

1. **Your running style** — Are you a heel striker or forefoot runner?
2. **Distance** — Daily trainers vs. race shoes
3. **Terrain** — Road, trail, or mixed surface
4. **Foot shape** — Wide, narrow, or standard

## Conclusion

The best running shoe is the one that fits your feet and your running goals. Visit a specialty running store for a gait analysis before making your decision.',
  'Maison Émile Editorial',
  now(),
  'Best Running Shoes 2026 — Expert Guide | Maison Émile',
  'Our expert guide to the best running shoes of 2026. Find your perfect pair with our comprehensive comparison across categories and price points.',
  NULL,
  'published'
)
ON CONFLICT (slug) DO NOTHING;
