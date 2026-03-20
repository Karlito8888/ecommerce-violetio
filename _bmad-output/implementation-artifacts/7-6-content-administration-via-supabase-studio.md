# Story 7.6: Content Administration via Supabase Studio (MVP)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Quick Reference — Files to Create/Update

| Action | File | Notes |
| ------ | ---- | ----- |
| CREATE | `supabase/migrations/20260331000000_content_admin_enhancements.sql` | Add admin-facing columns, validation constraints, helper views |
| UPDATE | `packages/shared/src/types/content.types.ts` | Add new fields (tags, related_slugs, sort_order) to ContentPage type |
| UPDATE | `packages/shared/src/clients/content.ts` | Update row mapper, add related content query, add sort_order support |
| CREATE | `packages/shared/src/utils/contentValidation.ts` | Slug format validation, Markdown lint helpers (for tests) |
| UPDATE | `packages/shared/src/utils/index.ts` | Export contentValidation utilities |
| UPDATE | `apps/web/src/routes/content/$slug.tsx` | Render related content links at bottom of article |
| UPDATE | `apps/web/src/routes/content/index.tsx` | Support sort_order for featured content ordering |
| CREATE | `apps/web/src/components/content/RelatedContent.tsx` | Related content links component |
| CREATE | `apps/web/src/styles/components/related-content.css` | BEM styles for `.related-content` |
| UPDATE | `apps/web/src/styles/index.css` | Import `related-content.css` |
| UPDATE | `apps/mobile/src/app/content/[slug].tsx` | Render related content links |
| CREATE | `docs/content-administration-guide.md` | Admin workflow documentation for Supabase Studio usage |
| CREATE | `apps/web/src/__tests__/contentAdmin.test.ts` | Tests for validation, related content, sort_order |
| UPDATE | `apps/web/src/__tests__/content.test.ts` | Add tests for new fields in mapper |

---

## Story

As an **administrator**,
I want to create, edit, and publish editorial content using Supabase Studio as the CMS interface,
So that I can manage content without building a custom admin UI for MVP.

## Acceptance Criteria

1. **Given** the `content_pages` table exists (from Story 7.1)
   **When** an admin needs to create or edit content
   **Then** Supabase Studio (Table Editor) is the designated CMS interface for MVP — no custom admin content UI is built (FR37)

2. **Given** the `content_pages` table schema
   **When** an admin creates a new content page
   **Then** the `status` column (enum: "draft", "published", "archived") controls content visibility
   **And** only rows with `status = 'published'` AND `published_at <= now()` are visible to visitors (enforced via existing RLS read policy)

3. **Given** a content page with `body_markdown` containing `{{product:violet_offer_id}}` embeds
   **When** a visitor views the published content
   **Then** the embed renders as an interactive product card via the existing `ContentProductCard` component (FR38)
   **And** internal links in Markdown (`[text](/products/123)` or `[text](/content/other-slug)`) work correctly (FR38)

4. **Given** the admin workflow
   **When** an admin wants to understand how to create/edit/publish content
   **Then** a documentation page exists in `docs/content-administration-guide.md` describing the full workflow

5. **Given** a content page with `related_slugs` field populated
   **When** a visitor views the published content
   **Then** related content links appear at the bottom of the article, linking to other published content pages

6. **Given** content pages with `sort_order` values
   **When** the content listing page is rendered
   **Then** featured content (with explicit sort_order) appears before chronologically-ordered content

7. **Given** the `content_pages` table with admin-facing enhancements
   **When** an admin uses Supabase Studio Table Editor
   **Then** column comments provide inline guidance for each field (visible in Studio's column tooltips)
   **And** CHECK constraints prevent common data entry errors (empty slugs, invalid status values)

## Tasks / Subtasks

- [x] **Task 1: Database migration — admin-facing enhancements** (AC: #1, #2, #5, #6, #7)
  - [x]1.1: Create `supabase/migrations/20260331000000_content_admin_enhancements.sql`:
    - Add `tags` column: `TEXT[] DEFAULT '{}'` — for future content categorization (admin can add tags via Studio)
    - Add `related_slugs` column: `TEXT[] DEFAULT '{}'` — array of slugs to link as related content (AC #5)
    - Add `sort_order` column: `INTEGER DEFAULT 0` — allows admin to pin/feature content (higher = more prominent) (AC #6)
    - Add column COMMENTS for Supabase Studio tooltips (AC #7):
      ```sql
      COMMENT ON COLUMN content_pages.slug IS 'URL-safe identifier. Use lowercase-with-hyphens. Example: best-running-shoes-2026';
      COMMENT ON COLUMN content_pages.status IS 'draft = not visible, published = visible to visitors (if published_at <= now), archived = hidden';
      COMMENT ON COLUMN content_pages.body_markdown IS 'Markdown content. Embed products with {{product:VIOLET_OFFER_ID}}. Internal links: [text](/products/ID) or [text](/content/slug)';
      COMMENT ON COLUMN content_pages.published_at IS 'Set to a future date for scheduled publishing. Must be set when status = published';
      COMMENT ON COLUMN content_pages.related_slugs IS 'Array of slugs for related content links at bottom of article. Example: {best-value-shoes,shoe-care-guide}';
      COMMENT ON COLUMN content_pages.sort_order IS '0 = default chronological. Higher values appear first in listings. Use 100+ for featured content';
      COMMENT ON COLUMN content_pages.tags IS 'Tags for categorization. Example: {running,shoes,guide}. Not displayed on frontend for MVP';
      COMMENT ON COLUMN content_pages.seo_title IS 'Custom page title for search engines. Falls back to title if empty';
      COMMENT ON COLUMN content_pages.seo_description IS 'Custom meta description for search engines. Falls back to first 160 chars of content';
      COMMENT ON COLUMN content_pages.featured_image_url IS 'Full URL to hero image. Used in article header and social previews (og:image)';
      ```
    - Add CHECK constraints (AC #7):
      ```sql
      ALTER TABLE content_pages ADD CONSTRAINT chk_slug_format CHECK (slug ~ '^[a-z0-9][a-z0-9-]*[a-z0-9]$');
      ALTER TABLE content_pages ADD CONSTRAINT chk_title_not_empty CHECK (char_length(trim(title)) > 0);
      ALTER TABLE content_pages ADD CONSTRAINT chk_published_has_date CHECK (status != 'published' OR published_at IS NOT NULL);
      ```
    - Add index on sort_order for listing query performance:
      ```sql
      CREATE INDEX IF NOT EXISTS idx_content_pages_sort_order ON content_pages(sort_order DESC, published_at DESC) WHERE status = 'published';
      ```
  - [x]1.2: Verify migration applies cleanly: `supabase db reset` or `supabase migration up`
  - [x]1.3: Verify existing seed data passes new constraints

- [x] **Task 2: Update shared types and client** (AC: #5, #6)
  - [x]2.1: Update `packages/shared/src/types/content.types.ts`:
    - Add to `ContentPage` interface:
      ```typescript
      tags: string[];
      relatedSlugs: string[];
      sortOrder: number;
      ```
  - [x]2.2: Update `packages/shared/src/clients/content.ts`:
    - Add `tags`, `related_slugs`, `sort_order` to `ContentPageRow` interface
    - Update `mapRow()` to map `related_slugs → relatedSlugs`, `sort_order → sortOrder`, `tags → tags`
    - Update SELECT columns in both `getContentPageBySlug` and `getContentPages` queries
    - Update `getContentPages` ordering: `ORDER BY sort_order DESC, published_at DESC` (AC #6)
  - [x]2.3: Create `packages/shared/src/utils/contentValidation.ts`:
    - Export `isValidSlug(slug: string): boolean` — validates against `^[a-z0-9][a-z0-9-]*[a-z0-9]$`
    - Export `CONTENT_FIELD_GUIDE` object with field descriptions (for documentation generation)
  - [x]2.4: Create `getRelatedContent` function in `content.ts`:
    ```typescript
    export async function getRelatedContent(
      client: SupabaseClient,
      slugs: string[],
    ): Promise<ContentPage[]> {
      if (slugs.length === 0) return [];
      const { data, error } = await client
        .from("content_pages")
        .select("id, slug, title, type, featured_image_url, seo_description, status, published_at")
        .in("slug", slugs)
        .eq("status", "published")
        .lte("published_at", new Date().toISOString());
      if (error || !data) return [];
      return data.map(/* minimal mapper for related content cards */);
    }
    ```

- [x] **Task 3: Related content component (Web)** (AC: #5)
  - [x]3.1: Create `apps/web/src/components/content/RelatedContent.tsx`:
    - Props: `{ slugs: string[] }`
    - Uses `getRelatedContent` via a TanStack Query hook
    - Renders a section with title "Related Articles" and a horizontal list of linked cards
    - Each card shows: title, type badge, featured image (or placeholder)
    - Links to `/content/{slug}`
    - BEM: `.related-content`, `.related-content__title`, `.related-content__list`, `.related-content__item`
    - If no related content found or slugs empty, renders nothing (no empty state)
  - [x]3.2: Create `apps/web/src/styles/components/related-content.css`:
    ```css
    .related-content { margin-top: var(--space-8); padding-top: var(--space-6); border-top: 1px solid var(--color-sand); }
    .related-content__title { font-size: var(--text-lg); margin-bottom: var(--space-4); }
    .related-content__list { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: var(--space-4); }
    .related-content__item { /* card styles similar to ContentListCard */ }
    ```
  - [x]3.3: Update `apps/web/src/styles/index.css` — add `@import "./components/related-content.css";`

- [x] **Task 4: Integrate related content into content page (Web)** (AC: #5)
  - [x]4.1: Update `apps/web/src/routes/content/$slug.tsx`:
    - Import `RelatedContent` component
    - Add `<RelatedContent slugs={content.relatedSlugs} />` after `.content-page__body` div
    - The component handles empty slugs gracefully (renders nothing)

- [x] **Task 5: Update content listing ordering (Web)** (AC: #6)
  - [x]5.1: No frontend changes needed — the `getContentPages` query update (Task 2.2) handles the ordering
    - Verify that the listing page still works correctly with the new sort order
    - Featured content (sort_order > 0) should appear before chronological content

- [x] **Task 6: Mobile — related content links** (AC: #5)
  - [x]6.1: Update `apps/mobile/src/app/content/[slug].tsx`:
    - Add a "Related Articles" section at the bottom
    - Use a simple `FlatList` or `ScrollView` with horizontal scroll for related content links
    - Each item links to the content detail screen via router navigation
    - If no related slugs, render nothing

- [x] **Task 7: Admin documentation** (AC: #4)
  - [x]7.1: Create `docs/content-administration-guide.md`:
    - **Overview**: Explain that Supabase Studio Table Editor is the MVP CMS
    - **Prerequisites**: Supabase project access, Studio URL
    - **Content Lifecycle**: draft → published → archived
    - **Step-by-step**: Creating a new content page
      1. Go to Table Editor → `content_pages`
      2. Click "Insert row"
      3. Fill in required fields: `slug`, `title`, `type`, `body_markdown`, `author`
      4. Set `status` to "draft" initially
      5. Preview by setting `status = 'published'` and `published_at = now()`
      6. Field guide for each column (with examples)
    - **Markdown Guide**: Basic Markdown syntax + product embed syntax `{{product:VIOLET_OFFER_ID}}`
    - **Product Embedding**: How to find Violet offer IDs, embed syntax, preview behavior
    - **Internal Linking**: How to link to products (`/products/ID`) and other content (`/content/slug`)
    - **Related Content**: How to use `related_slugs` field (enter as Postgres array: `{slug1,slug2}`)
    - **Featured Content**: How to use `sort_order` (set to 100+ to feature)
    - **Scheduled Publishing**: Set `published_at` to a future date
    - **SEO Tips**: seo_title, seo_description, featured_image_url best practices
    - **Common Mistakes**: Forgetting published_at, malformed slugs, forgetting to set status
    - **Future**: Note that a custom admin UI may replace Studio in a future iteration

- [x] **Task 8: Tests** (AC: all)
  - [x]8.1: Create `apps/web/src/__tests__/contentAdmin.test.ts`:
    - Test `isValidSlug()`: valid slugs, invalid slugs (spaces, uppercase, leading/trailing hyphens)
    - Test `getRelatedContent()` mock: returns mapped content, handles empty slugs, handles errors
    - Test sort_order: verify `getContentPages` query includes sort_order in ordering
  - [x]8.2: Update `apps/web/src/__tests__/content.test.ts`:
    - Update `mockContent` to include new fields (`tags`, `relatedSlugs`, `sortOrder`)
    - Verify the existing tests still pass with expanded type
  - [x]8.3: Use vitest + existing test patterns (pure function tests, mock Supabase client)

- [x] **Task 9: Quality checks** (AC: all)
  - [x]9.1: `bun run fix-all` exits 0 (Prettier + ESLint + TypeCheck)
  - [x]9.2: `bun --cwd=apps/web run test` — all 403+ existing tests pass + new tests pass
  - [x]9.3: `bun run typecheck` — 0 TypeScript errors
  - [x]9.4: Verify migration applies cleanly with `supabase db reset`
  - [x]9.5: Verify existing seed data passes new CHECK constraints
  - [x]9.6: Verify content listing page still renders correctly with new sort_order

## Dev Notes

### Critical Architecture Constraints

- **Supabase Studio IS the admin UI** — This story explicitly does NOT build any custom admin interface. The entire admin workflow happens through Supabase Studio's Table Editor. The development work is: database schema enhancements, documentation, and frontend display of admin-managed data (related content, sort order).

- **Existing RLS policies already enforce visibility** — The `public_read_published_content` RLS policy (Story 7.1) already restricts reads to `status = 'published' AND published_at <= now()`. The `service_role_all_content` policy gives admin full access. **Do NOT modify RLS policies.**

- **Existing `content_pages` table and queries** — Story 7.1 created the table with `status`, `published_at`, all core fields. Story 7.6 adds columns but DOES NOT modify existing columns or constraints. The migration must be additive only.

- **Product embed system already works** — `MarkdownRenderer.tsx` already splits content at `{{product:ID}}` boundaries and renders `ContentProductCard` components. Internal Markdown links already work via `marked` renderer. **Do NOT rebuild the embed or link system.**

- **Vanilla CSS + BEM only** — No Tailwind, no CSS-in-JS. New components follow BEM: `.related-content`, `.related-content__title`, etc.

- **No new dependencies** — All functionality uses existing Supabase client, TanStack Query, marked, DOMPurify. No CMS libraries, no admin UI frameworks.

### Existing Utilities to Reuse (DO NOT REBUILD)

| Utility | Location | What it provides |
| ------- | -------- | ---------------- |
| `getContentPageBySlug()` | `packages/shared/src/clients/content.ts` | Fetch single content page — UPDATE to include new fields |
| `getContentPages()` | `packages/shared/src/clients/content.ts` | Fetch content list — UPDATE ordering to use sort_order |
| `mapRow()` | `packages/shared/src/clients/content.ts` | Row mapper — UPDATE to include new fields |
| `MarkdownRenderer` | `apps/web/src/components/content/MarkdownRenderer.tsx` | Renders Markdown with product embeds — REUSE as-is |
| `ContentProductCard` | `apps/web/src/components/content/ContentProductCard.tsx` | Product embed card — REUSE as-is |
| `ContentListCard` | `apps/web/src/components/content/ContentListCard.tsx` | Content list card — reference for RelatedContent styling |
| `ContentTypeFilter` | `apps/web/src/components/content/ContentTypeFilter.tsx` | Type filter chip — REUSE as-is |
| `AffiliateDisclosure` | `apps/web/src/components/content/AffiliateDisclosure.tsx` | Affiliate notice — REUSE as-is |
| `buildPageMeta()` | `packages/shared/src/utils/seo.ts` | SEO meta tags — REUSE as-is |
| `formatDate()` | `packages/shared/src/utils/formatDate.ts` | Date formatting — REUSE for related content dates |
| Design tokens | `apps/web/src/styles/tokens.css` | `--color-sand`, `--space-*`, `--text-lg`, etc. |

### Existing Code Patterns to Follow

```typescript
// New fields in ContentPage interface
export interface ContentPage {
  // ... existing fields ...
  tags: string[];
  relatedSlugs: string[];
  sortOrder: number;
}
```

```typescript
// Updated mapRow — add new field mappings
function mapRow(row: ContentPageRow): ContentPage {
  return {
    // ... existing mappings ...
    tags: row.tags ?? [],
    relatedSlugs: row.related_slugs ?? [],
    sortOrder: row.sort_order ?? 0,
  };
}
```

```typescript
// getRelatedContent — minimal query for related content sidebar
export async function getRelatedContent(
  client: SupabaseClient,
  slugs: string[],
): Promise<Pick<ContentPage, "slug" | "title" | "type" | "featuredImageUrl" | "seoDescription">[]> {
  if (slugs.length === 0) return [];
  const { data, error } = await client
    .from("content_pages")
    .select("slug, title, type, featured_image_url, seo_description, status, published_at")
    .in("slug", slugs)
    .eq("status", "published")
    .lte("published_at", new Date().toISOString());
  if (error || !data) return [];
  return data.map((row) => ({
    slug: row.slug,
    title: row.title,
    type: row.type,
    featuredImageUrl: row.featured_image_url,
    seoDescription: row.seo_description,
  }));
}
```

```sql
-- Migration pattern: additive changes only
-- Add columns with defaults so existing rows are unaffected
ALTER TABLE content_pages ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
ALTER TABLE content_pages ADD COLUMN IF NOT EXISTS related_slugs TEXT[] DEFAULT '{}';
ALTER TABLE content_pages ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;
```

### Previous Story Intelligence (Story 7.5)

- **403 tests pass** — test count after Story 7.5. New admin tests should push to ~410+.
- **Web + Mobile scope** — Story 7.5 added share buttons to both web and mobile. Story 7.6 similarly affects both platforms (related content rendering).
- **Code review patterns** — Absolute URLs for share links (not relative). Same principle applies to related content links.
- **Commit pattern**: `feat: implement <description> (Story X.Y) + code review fixes`
- **`bun run fix-all` is the quality gate** — Prettier + ESLint + TypeCheck. Must pass before considering done.
- **Pure function extraction** — Story 7.4 established extracting pure functions to separate files for testability. Follow same for `contentValidation.ts`.

### Git Intelligence

- Recent commits: Stories 7.1–7.5 all in Epic 7 (Content, SEO & Editorial)
- Last commit: `3ca2963 feat: implement social sharing & rich previews (Story 7.5) + code review fixes`
- Codebase stable with 403 passing tests
- All Epic 7 web content components in `apps/web/src/components/content/`
- CSS files in `apps/web/src/styles/components/` and `apps/web/src/styles/pages/`

### Database Tables Referenced

| Table | Role in this story |
| ----- | ---- |
| `content_pages` | Main table — ADD columns (tags, related_slugs, sort_order), ADD column comments, ADD CHECK constraints |

### Scope Boundaries — What is NOT in this story

- **Custom admin UI** — Explicitly deferred. No admin dashboard, no content editor, no WYSIWYG. Supabase Studio only.
- **Content versioning/history** — Not in PRD requirements. Supabase doesn't have built-in versioning.
- **Image upload workflow** — Admins paste image URLs directly. No Supabase Storage upload UI for MVP.
- **Content preview** — No "preview draft" feature. Admin can set status to published temporarily.
- **Content search** — Content discovery is via listing page and type filter. No full-text search for MVP.
- **Tag-based filtering** — Tags column added for future use but no frontend filter for MVP.
- **Automated content validation** — CHECK constraints at DB level only. No real-time validation UI.
- **Content analytics** — No view counts, read time tracking, etc.
- **Multi-author workflow** — Single author field, no approval process, no editorial workflow.

### Project Structure Notes

- **Migration**: `supabase/migrations/20260331000000_content_admin_enhancements.sql` — additive schema changes
- **Updated types**: `packages/shared/src/types/content.types.ts` — new fields
- **Updated client**: `packages/shared/src/clients/content.ts` — new fields, related content query, sort_order
- **New util**: `packages/shared/src/utils/contentValidation.ts` — slug validation
- **New component**: `apps/web/src/components/content/RelatedContent.tsx` — related articles section
- **New CSS**: `apps/web/src/styles/components/related-content.css` — BEM styles
- **Updated routes**: content detail + content listing — related content + sort order
- **Updated mobile**: content detail — related content links
- **New docs**: `docs/content-administration-guide.md` — admin workflow guide
- **New tests**: `apps/web/src/__tests__/contentAdmin.test.ts`

### References

- [Source: epics.md#Story 7.6 — Content Administration via Supabase Studio acceptance criteria]
- [Source: prd.md#FR37 — "Content editors (admin) can publish and manage editorial content pages"]
- [Source: prd.md#FR38 — "Content pages can include internal links to product pages and related editorial content"]
- [Source: architecture.md — "Administration: Supabase dashboard for MVP (deferred admin panel)"]
- [Source: supabase/migrations/20260330000000_content_pages.sql — existing table schema]
- [Source: packages/shared/src/clients/content.ts — existing content client]
- [Source: packages/shared/src/types/content.types.ts — existing content types]
- [Source: apps/web/src/components/content/MarkdownRenderer.tsx — product embed system]
- [Source: apps/web/src/components/content/ContentProductCard.tsx — product embed card]
- [Source: apps/web/src/routes/content/$slug.tsx — content detail page]
- [Source: apps/web/src/routes/content/index.tsx — content listing page]
- [Source: 7-5-social-sharing-rich-previews.md — previous story learnings]
- [Source: CLAUDE.md — BEM CSS, no Tailwind, Prettier, ESLint, conventional commits]

## Dev Agent Record

### Agent Model Used

claude-opus-4-6

### Debug Log References

- Mobile expo-router strict href typing doesn't allow dynamic string templates — used `as never` cast on `router.push()` consistent with existing mobile codebase pattern.
- Initial approach for mobile related content used `<Link>` component but expo-router requires strictly-typed routes — switched to `router.push()` with `as never`.

### Completion Notes List

- Created `supabase/migrations/20260331000000_content_admin_enhancements.sql` — additive migration adding `tags TEXT[]`, `related_slugs TEXT[]`, `sort_order INTEGER` columns. 10 column COMMENTs for Supabase Studio tooltips. 3 CHECK constraints (`chk_slug_format`, `chk_title_not_empty`, `chk_published_has_date`). Partial index on `sort_order DESC, published_at DESC`.
- Updated `packages/shared/src/types/content.types.ts` — added `tags: string[]`, `relatedSlugs: string[]`, `sortOrder: number` to `ContentPage` interface.
- Updated `packages/shared/src/clients/content.ts` — extended `ContentPageRow` with new fields, updated `mapRow()` with null-coalescing defaults, added `sort_order DESC` ordering to `getContentPages`, added `getRelatedContent()` function and `RelatedContentItem` type.
- Created `packages/shared/src/utils/contentValidation.ts` — `isValidSlug()` function matching DB CHECK regex, `CONTENT_FIELD_GUIDE` object with field metadata.
- Exported new functions from `clients/index.ts` and `utils/index.ts`.
- Created `apps/web/src/components/content/RelatedContent.tsx` — related articles section with TanStack Query, BEM CSS, placeholder images per content type, accessible with `aria-labelledby`.
- Created `apps/web/src/styles/components/related-content.css` — BEM styles mirroring ContentListCard pattern with grid layout, hover effects, type-based placeholder gradients.
- Updated `apps/web/src/routes/content/$slug.tsx` — added `<RelatedContent slugs={content.relatedSlugs} />` after body.
- Updated `apps/web/src/server/getContent.ts` — added `getRelatedContentFn` server function.
- Updated `apps/mobile/src/app/content/[slug].tsx` — added new fields to mapper, fetches related content, renders "Related Articles" section with `Pressable` + `router.push()`.
- Created `docs/content-administration-guide.md` — comprehensive admin guide covering content lifecycle, Markdown syntax, product embedding, SEO fields, common mistakes.
- Created `apps/web/src/__tests__/contentAdmin.test.ts` — 11 tests: isValidSlug (9 cases), CONTENT_FIELD_GUIDE structure (2 cases).
- Updated `apps/web/src/__tests__/content.test.ts` — added `tags`, `relatedSlugs`, `sortOrder` to mockContent.
- All 414 tests pass (403 existing + 11 new). `bun run fix-all` exits 0. TypeCheck clean.

### Senior Developer Review (AI)

**Reviewer:** Charles (via adversarial code review workflow)
**Date:** 2026-03-20
**Outcome:** Approved (after fixes)

**Issues Found:** 1 High, 3 Medium, 3 Low
**Issues Fixed:** 1 High, 3 Medium (all HIGH/MEDIUM resolved)

**Fixes Applied:**
1. **H1 — Missing tests (FIXED):** Added 6 new tests for `getRelatedContent()` (3 tests: valid slugs, empty input, error handling) and `getContentPages` sort_order (3 tests: featured ordering, field mapping, null defaults). Total tests: 414 → 420.
2. **M1 — Stale JSDoc (FIXED):** Updated `getContentPages` docstring to reflect `sort_order DESC, published_at DESC` ordering.
3. **M2 — Mobile code duplication (FIXED):** Refactored `apps/mobile/src/app/content/[slug].tsx` to use `getContentPageBySlug()` and `getRelatedContent()` from `@ecommerce/shared` instead of inline queries and mapping. Eliminated ~50 lines of duplicated code.
4. **M3 — Mobile `select("*")` (FIXED):** Resolved by M2 fix — shared functions use explicit column selection.

**Remaining LOW issues (acceptable for MVP):**
- L1: `seoDescription` fetched but unused in RelatedContent UI
- L2: Slug regex allows consecutive hyphens
- L3: Related content order not preserved from `related_slugs` array

### Change Log

- 2026-03-20: Code review completed — 4 fixes applied (missing tests, stale JSDoc, mobile code duplication, select("*")). 420 tests pass. Status → done.
- 2026-03-20: Story 7.6 implementation complete — database admin enhancements (3 new columns, 10 column comments, 3 CHECK constraints, 1 index), related content component (web + mobile), sort_order listing support, admin documentation guide. 11 new tests added. No custom admin UI built — Supabase Studio is the MVP CMS.

### File List

- `supabase/migrations/20260331000000_content_admin_enhancements.sql` (CREATE — additive migration)
- `packages/shared/src/types/content.types.ts` (UPDATE — 3 new fields)
- `packages/shared/src/clients/content.ts` (UPDATE — new row fields, sort_order ordering, getRelatedContent)
- `packages/shared/src/clients/index.ts` (UPDATE — export getRelatedContent, RelatedContentItem)
- `packages/shared/src/utils/contentValidation.ts` (CREATE — isValidSlug, CONTENT_FIELD_GUIDE)
- `packages/shared/src/utils/index.ts` (UPDATE — export contentValidation)
- `apps/web/src/components/content/RelatedContent.tsx` (CREATE — related articles component)
- `apps/web/src/styles/components/related-content.css` (CREATE — BEM styles)
- `apps/web/src/styles/index.css` (UPDATE — import related-content.css)
- `apps/web/src/routes/content/$slug.tsx` (UPDATE — add RelatedContent)
- `apps/web/src/server/getContent.ts` (UPDATE — add getRelatedContentFn)
- `apps/mobile/src/app/content/[slug].tsx` (UPDATE — new fields mapper, related content section)
- `docs/content-administration-guide.md` (CREATE — admin workflow guide)
- `apps/web/src/__tests__/contentAdmin.test.ts` (CREATE — 11 tests)
- `apps/web/src/__tests__/content.test.ts` (UPDATE — new fields in mockContent)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (UPDATE — story status tracking)
- `_bmad-output/implementation-artifacts/7-6-content-administration-via-supabase-studio.md` (UPDATE — story status + dev record)
