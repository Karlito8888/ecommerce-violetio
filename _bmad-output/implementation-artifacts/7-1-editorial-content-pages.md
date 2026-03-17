# Story 7.1: Editorial Content Pages

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Quick Reference — Files to Create/Update

| Action | File | Notes |
| ------ | ---- | ----- |
| CREATE | `supabase/migrations/00025_content_pages.sql` | `content_pages` table with RLS (public read, service_role write) |
| CREATE | `packages/shared/src/types/content.ts` | Content page types (ContentPage, ContentType, ContentStatus) |
| CREATE | `packages/shared/src/hooks/useContent.ts` | TanStack Query options for content (detail + list) |
| CREATE | `apps/web/src/server/getContent.ts` | Server Functions for content fetching from Supabase |
| CREATE | `apps/web/src/routes/content/$slug.tsx` | Content detail page (SSR, Markdown rendering, product cards) |
| CREATE | `apps/web/src/components/content/ContentProductCard.tsx` | Inline product card for editorial content (fetches live data) |
| CREATE | `apps/web/src/components/content/MarkdownRenderer.tsx` | Markdown to sanitized HTML renderer with product embed support |
| CREATE | `apps/web/src/components/content/AffiliateDisclosure.tsx` | Affiliate disclosure banner component |
| CREATE | `apps/web/src/styles/pages/content.css` | BEM styles for content page |
| CREATE | `apps/web/src/styles/components/affiliate-disclosure.css` | BEM styles for disclosure banner |
| CREATE | `apps/web/src/styles/components/content-product-card.css` | BEM styles for inline product card |
| CREATE | `apps/mobile/src/app/content/[slug].tsx` | Mobile content screen |
| CREATE | `apps/mobile/src/app/content/_layout.tsx` | Mobile content stack layout |
| CREATE | `apps/web/src/__tests__/content.test.ts` | Tests for content utilities and markdown rendering |
| UPDATE | `packages/shared/src/types/index.ts` | Add content type exports |
| UPDATE | `packages/shared/src/hooks/index.ts` | Add content hook exports |
| UPDATE | `apps/web/src/styles/index.css` | Add content CSS imports |
| UPDATE | `packages/shared/src/clients/supabase.ts` | Add `getContentPage()` and `getContentPages()` data functions |
| UPDATE | `packages/shared/src/clients/index.ts` | Export new content data functions |

---

## Story

As a **visitor**,
I want to read editorial content (guides, comparisons, reviews) that link to relevant products,
So that I can make informed purchasing decisions.

## Acceptance Criteria

1. **Given** editorial content exists in the CMS (Supabase `content_pages` table)
   **When** a visitor navigates to a content page (e.g., `/content/best-running-shoes-2026`)
   **Then** the page displays formatted content with title, author, date, body (Markdown rendered to sanitized HTML) (FR9)
   **And** the page is server-side rendered for SEO (FR34)

2. **Given** the `content_pages` Supabase table
   **When** the migration `supabase/migrations/00025_content_pages.sql` is applied
   **Then** the table has columns: `id` (UUID PK), `slug` (unique text), `title` (text), `type` (enum: "guide", "comparison", "review"), `body_markdown` (text), `author` (text), `published_at` (timestamptz), `seo_title` (text nullable), `seo_description` (text nullable), `featured_image_url` (text nullable), `status` (enum: "draft", "published", "archived"), `created_at`, `updated_at`
   **And** RLS is enabled with public read for `status = 'published' AND published_at <= now()`
   **And** service_role has full access

3. **Given** content types "guide", "comparison", "review"
   **When** content is displayed
   **Then** the type is shown as a badge/label on the content page

4. **Given** product links within content use the `{{product:violet_offer_id}}` embed convention
   **When** the Markdown body is rendered
   **Then** product embeds are rendered as interactive product cards (image, name, price, "View Product" CTA) (FR38)
   **And** product cards fetch live data from the `products` table (availability, current price)
   **And** product cards link to `/products/{productId}`

5. **Given** the web content page route
   **When** a visitor accesses `/content/{slug}`
   **Then** the page is at `apps/web/src/routes/content/$slug.tsx`, SSR-rendered (FR34)
   **And** the page has proper meta tags (title, description, canonical, Open Graph)
   **And** BEM CSS classes follow the convention: `content-page`, `content-page__header`, `content-page__body`, `content-page__product-card`

6. **Given** the mobile content screen
   **When** a user opens content on mobile
   **Then** the screen is at `apps/mobile/src/app/content/[slug].tsx`
   **And** content renders in a scrollable view with native styling

7. **Given** any content page
   **When** it is displayed (web or mobile)
   **Then** an affiliate disclosure banner is visible (FR11)

## Tasks / Subtasks

- [x] **Task 1: Supabase migration — `content_pages` table** (AC: #2)
  - [x]1.1: Create `supabase/migrations/00025_content_pages.sql`
  - [x]1.2: Create `content_page_type` enum: `'guide'`, `'comparison'`, `'review'`
  - [x]1.3: Create `content_page_status` enum: `'draft'`, `'published'`, `'archived'`
  - [x]1.4: Create `content_pages` table:
    ```sql
    CREATE TABLE IF NOT EXISTS public.content_pages (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      slug TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      type content_page_type NOT NULL DEFAULT 'guide',
      body_markdown TEXT NOT NULL DEFAULT '',
      author TEXT NOT NULL DEFAULT '',
      published_at TIMESTAMPTZ,
      seo_title TEXT,
      seo_description TEXT,
      featured_image_url TEXT,
      status content_page_status NOT NULL DEFAULT 'draft',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    ```
  - [x]1.5: Enable RLS + policies:
    - `public_read_published`: `FOR SELECT TO anon, authenticated USING (status = 'published' AND published_at <= now())`
    - `service_role_all`: `FOR ALL TO service_role USING (true) WITH CHECK (true)`
  - [x]1.6: Create indexes: `idx_content_pages_slug` (unique), `idx_content_pages_type`, `idx_content_pages_status_published` (composite for published content queries)
  - [x]1.7: Add `updated_at` trigger reusing existing `update_updated_at_column()` function
  - [x]1.8: Add a seed content row for testing (type: 'guide', status: 'published')
  - [x]1.9: NOTE: Follow idempotent pattern from existing migrations (`IF NOT EXISTS`, `DO $$ ... $$` blocks)

- [x] **Task 2: Shared types — `ContentPage`** (AC: #1, #2)
  - [x]2.1: Create `packages/shared/src/types/content.ts`:
    ```typescript
    export type ContentType = "guide" | "comparison" | "review";
    export type ContentStatus = "draft" | "published" | "archived";

    export interface ContentPage {
      id: string;
      slug: string;
      title: string;
      type: ContentType;
      bodyMarkdown: string;
      author: string;
      publishedAt: string | null;
      seoTitle: string | null;
      seoDescription: string | null;
      featuredImageUrl: string | null;
      status: ContentStatus;
      createdAt: string;
      updatedAt: string;
    }
    ```
  - [x]2.2: Export from `packages/shared/src/types/index.ts`
  - [x]2.3: NOTE: Use camelCase in TS types; Supabase returns snake_case — transformation happens in the data function

- [x] **Task 3: Data functions — Supabase content queries** (AC: #1, #4)
  - [x]3.1: Add to `packages/shared/src/clients/supabase.ts` (or new `supabase-content.ts` if file is large):
    ```typescript
    export async function getContentPageBySlug(
      client: SupabaseClient,
      slug: string
    ): Promise<ContentPage | null>

    export async function getContentPages(
      client: SupabaseClient,
      params: { type?: ContentType; page?: number; limit?: number }
    ): Promise<{ items: ContentPage[]; total: number }>
    ```
  - [x]3.2: Transform snake_case DB response to camelCase ContentPage type
  - [x]3.3: Only return `status = 'published' AND published_at <= now()` (defense in depth — RLS already enforces this)
  - [x]3.4: Export from `packages/shared/src/clients/index.ts`
  - [x]3.5: NOTE: Use `.select()` to avoid fetching unnecessary columns. Order by `published_at DESC`.

- [x] **Task 4: TanStack Query hooks — `useContent`** (AC: #1)
  - [x]4.1: Create `packages/shared/src/hooks/useContent.ts`:
    ```typescript
    export type ContentDetailFetchFn = (slug: string) => Promise<ApiResponse<ContentPage>>;
    export type ContentListFetchFn = (params: ContentListParams) => Promise<ApiResponse<ContentListResult>>;

    export function contentDetailQueryOptions(slug: string, fetchFn: ContentDetailFetchFn) {
      return queryOptions({
        queryKey: ["content", "detail", slug],
        queryFn: () => fetchFn(slug),
        staleTime: 10 * 60 * 1000, // 10 minutes (content changes less often)
      });
    }

    export function contentListQueryOptions(params: ContentListParams, fetchFn: ContentListFetchFn) {
      return queryOptions({
        queryKey: ["content", "list", params.type ?? "all", params.page ?? 1],
        queryFn: () => fetchFn(params),
        staleTime: 5 * 60 * 1000,
      });
    }
    ```
  - [x]4.2: Export from `packages/shared/src/hooks/index.ts`
  - [x]4.3: NOTE: Follow existing pattern from `useProducts.ts` — export query options functions, NOT hooks. Platform-specific fetch functions injected as parameters.

- [x] **Task 5: Web Server Functions — content data fetching** (AC: #1)
  - [x]5.1: Create `apps/web/src/server/getContent.ts`:
    ```typescript
    export const getContentBySlug = createServerFn({ method: "GET" })
      .validator((slug: string) => slug)
      .handler(async ({ input: slug }) => {
        const client = getServiceRoleClient(); // or anon client — RLS handles access
        const result = await getContentPageBySlug(client, slug);
        if (!result) return { data: null, error: { code: "NOT_FOUND", message: "Content not found" } };
        return { data: result, error: null };
      });
    ```
  - [x]5.2: Add `getContentList` server function for listing (used by Story 7.2 later)
  - [x]5.3: NOTE: Follow `getProduct.ts` pattern exactly. Use `createServerFn({ method: "GET" })` with `.validator()` and `.handler()`.

- [x] **Task 6: Markdown renderer with product embeds** (AC: #1, #4)
  - [x]6.1: Install dependencies for Markdown rendering and HTML sanitization:
    - `bun add --cwd=apps/web marked` (Markdown to HTML, ~30KB)
    - `bun add --cwd=apps/web dompurify` (HTML sanitization against XSS)
    - `bun add --cwd=apps/web --dev @types/dompurify`
  - [x]6.2: Create `apps/web/src/components/content/MarkdownRenderer.tsx`:
    - Parse `body_markdown` with `marked`
    - **CRITICAL: Sanitize HTML output with DOMPurify before rendering** to prevent XSS even with admin-controlled content (defense-in-depth)
    - Before rendering, extract `{{product:OFFER_ID}}` embeds from markdown
    - Split markdown at `{{product:...}}` boundaries into segments
    - For text segments: parse with `marked`, sanitize with `DOMPurify.sanitize()`, render via safe innerHTML
    - For product embeds: render `<ContentProductCard productId="ID" />` React components
    - **SSR consideration**: DOMPurify requires a DOM — use `isomorphic-dompurify` or conditionally import for server/client. Alternatively, sanitize only on client hydration if SSR output is trusted.
  - [x]6.3: BEM class: `.content-page__body` wraps rendered HTML; style markdown elements via descendant selectors (`.content-page__body h2`, `.content-page__body p`, etc.)
  - [x]6.4: NOTE: Configure `marked` to add `target="_blank"` and `rel="noopener noreferrer"` to external links via a custom renderer.
  - [x]6.5: NOTE: Prefer `isomorphic-dompurify` over `dompurify` for SSR compatibility: `bun add --cwd=apps/web isomorphic-dompurify`

- [x] **Task 7: ContentProductCard component** (AC: #4)
  - [x]7.1: Create `apps/web/src/components/content/ContentProductCard.tsx`:
    ```typescript
    interface ContentProductCardProps {
      productId: string; // violet_offer_id from {{product:ID}} embed
    }
    ```
  - [x]7.2: Fetch product data from `products` table using existing `productDetailQueryOptions` or a direct Supabase query
  - [x]7.3: Render: product image, name, price, "View Product" CTA linking to `/products/{id}`
  - [x]7.4: Handle loading state (skeleton), error state (graceful fallback with text link), not-found state
  - [x]7.5: BEM: `.content-product-card`, `.content-product-card__image`, `.content-product-card__info`, `.content-product-card__name`, `.content-product-card__price`, `.content-product-card__cta`
  - [x]7.6: NOTE: This is NOT the same as `BaseProductCard` — it's an inline card optimized for editorial context (horizontal layout, CTA button, different sizing). Reuse data patterns but not the component.

- [x] **Task 8: Affiliate disclosure component** (AC: #7)
  - [x]8.1: Create `apps/web/src/components/content/AffiliateDisclosure.tsx`:
    - Static text: "This page contains affiliate links. We may earn a commission on purchases made through these links at no extra cost to you."
    - Rendered as a `<aside>` with `role="note"` for accessibility
  - [x]8.2: BEM: `.affiliate-disclosure`, `.affiliate-disclosure__text`
  - [x]8.3: CSS: Subtle styling — light background, small text, top of content area
  - [x]8.4: NOTE: This component will be reused on product pages in a later story if needed. Keep it generic.

- [x] **Task 9: Web content page route — `/content/$slug`** (AC: #1, #3, #5)
  - [x]9.1: Create `apps/web/src/routes/content/$slug.tsx`:
    ```typescript
    export const Route = createFileRoute("/content/$slug")({
      loader: async ({ params, context }) => {
        const queryClient = context.queryClient;
        await queryClient.ensureQueryData(
          contentDetailQueryOptions(params.slug, getContentBySlug)
        );
      },
      head: ({ loaderData }) => {
        // Dynamic meta tags: title, description, canonical, Open Graph
        // JSON-LD Article structured data
      },
      pendingComponent: ContentSkeleton,
      errorComponent: ContentError,
      component: ContentPage,
    });
    ```
  - [x]9.2: Component renders: header (title, author, date, type badge), affiliate disclosure, markdown body with product embeds, footer navigation
  - [x]9.3: `head()` generates:
    - `<title>`: `seo_title || title`
    - `<meta name="description">`: `seo_description || first 160 chars of body`
    - `<link rel="canonical">`: `${SITE_URL}/content/${slug}`
    - Open Graph tags: `og:title`, `og:description`, `og:image` (featured_image_url), `og:type: article`
    - JSON-LD `Article` schema: `headline`, `author`, `datePublished`, `image`
  - [x]9.4: BEM structure: `.content-page` > `.content-page__header` + `.content-page__disclosure` + `.content-page__body` + `.content-page__footer`
  - [x]9.5: NOTE: Follow `products/$productId.tsx` pattern exactly for loader/head/component structure.

- [x] **Task 10: CSS styles** (AC: #5)
  - [x]10.1: Create `apps/web/src/styles/pages/content.css`:
    - `.content-page` — max-width container (720px for readability), centered
    - `.content-page__header` — title (Cormorant Garamond serif per UX spec), author, date, type badge
    - `.content-page__body` — markdown content styling via descendant selectors:
      - `h2, h3`: serif font, proper spacing
      - `p`: Inter body text, 1.6 line-height
      - `img`: responsive, rounded corners
      - `blockquote`: left border accent
      - `code, pre`: monospace with background
      - `a`: branded link color with hover state
      - `ul, ol`: proper indentation and bullet styling
    - Responsive breakpoints: mobile-first, desktop max-width
  - [x]10.2: Create `apps/web/src/styles/components/content-product-card.css`:
    - `.content-product-card` — horizontal layout (image left, info right) on desktop, stacked on mobile
    - Subtle border/background to differentiate from body text
    - CTA button styled per design system
  - [x]10.3: Create `apps/web/src/styles/components/affiliate-disclosure.css`:
    - `.affiliate-disclosure` — light muted background, small italic text, subtle top/bottom borders
  - [x]10.4: Update `apps/web/src/styles/index.css`:
    - Add `@import "./components/affiliate-disclosure.css";` after `recently-viewed-row.css`
    - Add `@import "./components/content-product-card.css";` after `affiliate-disclosure.css`
    - Add `@import "./pages/content.css";` after `wishlist.css`

- [x] **Task 11: Mobile content screen** (AC: #6)
  - [x]11.1: Create `apps/mobile/src/app/content/_layout.tsx` — Stack navigator for content screens
  - [x]11.2: Create `apps/mobile/src/app/content/[slug].tsx`:
    - Fetch content from Supabase using `createSupabaseClient()`
    - Render markdown body (use React Native `Text` components or a lightweight RN markdown lib)
    - Show affiliate disclosure at top
    - Product embeds render as tappable cards (navigate to product detail)
  - [x]11.3: For Markdown rendering on mobile, evaluate:
    - Option A: `react-native-markdown-display` (popular, customizable)
    - Option B: Simple regex parsing for basic formatting (if content is simple)
    - Recommend Option A for full Markdown support
  - [x]11.4: NOTE: Mobile content screen is simpler — no SSR needed, no JSON-LD. Focus on readable scroll view.
  - [x]11.5: NOTE: Check Expo SDK 55 compatibility for chosen markdown library. Do NOT install React 19 incompatible packages.

- [x] **Task 12: Tests** (AC: all)
  - [x]12.1: Create `apps/web/src/__tests__/content.test.ts`:
    - Test markdown rendering: basic markdown to sanitized HTML output
    - Test `{{product:ID}}` embed extraction and splitting from markdown
    - Test content query options (query keys, stale times)
    - Test SEO meta tags generation for content pages
    - Test affiliate disclosure renders on content page
  - [x]12.2: Follow established pattern: test pure functions and component rendering, not hooks
  - [x]12.3: NOTE: Use vitest + @testing-library/react consistent with existing test setup

- [x] **Task 13: Quality checks** (AC: all)
  - [x]13.1: `bun run fix-all` exits 0 (Prettier + ESLint + TypeCheck all clean)
  - [x]13.2: `bun --cwd=apps/web run test` — all tests pass
  - [x]13.3: `bun run typecheck` — 0 TypeScript errors
  - [x]13.4: Verify migration applies cleanly against local Supabase

## Dev Notes

### Critical Architecture Constraints

- **SSR mandatory for content pages** — Content pages MUST be server-side rendered via TanStack Start's `loader` pattern for SEO. Follow the exact pattern from `products/$productId.tsx`: `loader` → `ensureQueryData` → `useSuspenseQuery` in component.

- **Vanilla CSS + BEM only** — No Tailwind, no CSS-in-JS. All styles in dedicated CSS files under `apps/web/src/styles/`. BEM convention: `.content-page__element--modifier`. Use CSS custom properties from `tokens.css`.

- **Supabase RLS enforces access** — The `content_pages` table uses RLS to only show published content. Even though Server Functions use `getServiceRoleClient()`, prefer using the anon client for content reads so RLS naturally filters drafts. Defense in depth: also add `WHERE status = 'published'` in queries.

- **Product embeds fetch live data** — The `{{product:violet_offer_id}}` convention in Markdown embeds product cards that fetch LIVE data from the `products` table (not hardcoded). This ensures price/availability is always current. Product data comes from the existing `products` table populated by the webhook sync (Story 3.7).

- **HTML sanitization is MANDATORY** — Even though content is admin-controlled via Supabase Studio, ALL Markdown-rendered HTML MUST be sanitized with DOMPurify (or `isomorphic-dompurify` for SSR) before rendering. This is a defense-in-depth requirement: admin accounts can be compromised, and unsanitized HTML via `innerHTML` is a known XSS vector. Never render raw HTML without sanitization.

- **Editorial typography** — Per UX spec: headings use Cormorant Garamond (serif, `var(--font-heading)`), body uses Inter (sans-serif, `var(--font-body)`). Content pages are "Editorial mode" — generous whitespace, large type, magazine-inspired layout. Max content width ~720px for readability.

- **Markdown rendering: `marked` + `isomorphic-dompurify`** — Use `marked` (~30KB) for Markdown to HTML conversion, then `isomorphic-dompurify` for sanitization. Do NOT use `react-markdown` (heavier, unnecessary React re-rendering of static content). `marked` is SSR-compatible and fast. `isomorphic-dompurify` works in both Node/Bun (SSR) and browser environments.

- **Affiliate disclosure is legally required** — FR11 mandates visible affiliate disclosure on every page with product links. The `<AffiliateDisclosure>` component renders at the top of every content page. Use `<aside role="note">` for accessibility.

- **Migration numbering** — Next available migration number: `00025`. Follow the `YYYYMMDDHHMMSS_description.sql` timestamp format consistent with existing migrations. Use `IF NOT EXISTS` guards for idempotency.

- **Expo SDK 55 pinning** — If installing a mobile markdown rendering library, verify compatibility with React 19.2.0 and React Native 0.83.2. Never bump core Expo dependencies.

- **No Tailwind CSS on mobile either** — Mobile uses React Native `StyleSheet`. No NativeWind, no Tailwind.

### Existing Utilities to Reuse (DO NOT REBUILD)

| Utility | Location | What it provides |
| ------- | -------- | ---------------- |
| `createSupabaseClient()` | `packages/shared/src/clients/supabase.ts` | Browser Supabase client (singleton) |
| `getServiceRoleClient()` | `packages/shared/src/clients/supabase.server.ts` | Server-only Supabase client (bypasses RLS) |
| `createServerFn()` | `@tanstack/react-start` | Server Function factory with validator + handler |
| `queryOptions()` | `@tanstack/react-query` | Creates type-safe query options for SSR + client |
| `BaseProductCard` | `apps/web/src/components/product/BaseProductCard.tsx` | Product card UI — study for styling patterns (but build separate ContentProductCard) |
| `productDetailQueryOptions` | `packages/shared/src/hooks/useProducts.ts` | Product data fetching — can reuse for product embed data |
| `useLocalSearchParams()` | Expo Router built-in | Mobile route parameter access |
| `update_updated_at_column()` | Existing trigger function in earlier migration | Reuse for content_pages `updated_at` trigger |
| `products` table | `supabase/migrations/` (existing) | Product data — query by `violet_offer_id` for embeds |
| `buildProductJsonLd()` | `apps/web/src/routes/products/$productId.tsx` | JSON-LD builder pattern — follow for Article schema |

### Existing Code Patterns to Follow

```typescript
// Route pattern (from products/$productId.tsx):
export const Route = createFileRoute("/content/$slug")({
  loader: async ({ params, context }) => {
    const queryClient = context.queryClient;
    await queryClient.ensureQueryData(
      contentDetailQueryOptions(params.slug, getContentBySlug)
    );
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: loaderData?.data?.seoTitle || loaderData?.data?.title },
      { name: "description", content: loaderData?.data?.seoDescription },
      { property: "og:title", content: loaderData?.data?.title },
      { property: "og:type", content: "article" },
    ],
  }),
  pendingComponent: ContentSkeleton,
  errorComponent: ContentError,
  component: ContentPage,
});
```

```typescript
// Server Function pattern (from getProduct.ts):
export const getContentBySlug = createServerFn({ method: "GET" })
  .validator((slug: string) => slug)
  .handler(async ({ input: slug }) => {
    // Fetch from Supabase, transform snake_case to camelCase
    // Return { data, error } discriminated union
  });
```

```typescript
// Query options pattern (from useProducts.ts):
export function contentDetailQueryOptions(
  slug: string,
  fetchFn: ContentDetailFetchFn,
) {
  return queryOptions({
    queryKey: ["content", "detail", slug],
    queryFn: () => fetchFn(slug),
    staleTime: 10 * 60 * 1000,
  });
}
```

```sql
-- Migration pattern (from existing migrations):
CREATE TABLE IF NOT EXISTS public.content_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- columns ...
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.content_pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_read_published_content" ON public.content_pages
  FOR SELECT TO anon, authenticated
  USING (status = 'published' AND published_at <= now());

CREATE POLICY "service_role_all_content" ON public.content_pages
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);
```

```css
/* BEM page CSS pattern (from about.css / home.css): */
.content-page {
  max-width: 720px;
  margin: 0 auto;
  padding: var(--space-8) var(--space-4);
}

.content-page__header {
  margin-bottom: var(--space-8);
}

.content-page__title {
  font-family: var(--font-heading);
  font-size: 2.5rem;
  line-height: 1.2;
}

.content-page__body h2 {
  font-family: var(--font-heading);
  margin-top: var(--space-8);
}
```

### Markdown Rendering Strategy

The content body uses Markdown stored in Supabase. The rendering pipeline:

1. **Server-side**: `loader` fetches `ContentPage` from Supabase via Server Function
2. **Component**: Split `body_markdown` at `{{product:ID}}` boundaries
3. **For each segment**:
   - Text segments: Parse with `marked` → sanitize with `isomorphic-dompurify` → render as safe HTML
   - Product embeds: Render `<ContentProductCard productId="ID" />`
4. **Product cards**: Fetch live product data from the `products` table, show image/name/price/CTA
5. **Styling**: Markdown HTML elements styled via `.content-page__body` descendant selectors

```typescript
// Markdown split approach:
function splitContentWithEmbeds(markdown: string): Array<
  | { type: "markdown"; content: string }
  | { type: "product"; productId: string }
> {
  const EMBED_REGEX = /\{\{product:([a-zA-Z0-9_-]+)\}\}/g;
  // Split and return alternating markdown/product segments
}

// Sanitized rendering approach:
import DOMPurify from "isomorphic-dompurify";
import { marked } from "marked";

function renderMarkdownSegment(markdown: string): string {
  const rawHtml = marked.parse(markdown);
  return DOMPurify.sanitize(rawHtml); // XSS-safe HTML
}
```

### Previous Story Intelligence (Story 6.8)

- **Implementation sequence**: Types → migration → data functions → hooks → server functions → components → routes → CSS → tests → quality checks
- **Barrel exports**: Always update `types/index.ts` and `hooks/index.ts` when adding new modules
- **Mobile route typing**: Use `router.push("..." as never)` cast for dynamic Expo Router paths
- **Pure function testing**: Test data transformation functions and utilities, not hooks directly
- **Deep imports don't work**: Must use barrel exports via `@ecommerce/shared`

### Git Intelligence

- Commit pattern: `feat: implement <description> (Story X.Y) + code review fixes`
- Last 3 commits: Epic 6 final stories (deep linking, push notifications, recently viewed). The codebase has established consistent patterns across 30+ stories.
- New dependencies should be added with `bun add --cwd=apps/web` (not root)

### Scope Boundaries — What is NOT in this story

- **Content listing page** (`/content/index.tsx`): That's Story 7.2. This story creates the detail page only.
- **Advanced SEO** (comprehensive JSON-LD, meta tag helper library): Basic SEO meta tags and Article JSON-LD are included here. Advanced structured data optimization is Story 7.3.
- **Sitemap integration**: Story 7.4 will add content pages to the sitemap.
- **Social sharing buttons**: Story 7.5 adds share functionality.
- **Content administration UI**: Story 7.6 documents the Supabase Studio workflow. No custom admin UI.
- **Deep link updates for content**: The AASA/assetlinks files from Story 6.8 can be updated in a follow-up to include `/content/*` paths once routes exist.
- **Content categories/tags**: Not in scope. Simple type-based filtering only.
- **Comments or ratings on content**: Not in PRD.
- **Content search**: Not in scope — content is browsed via listing (Story 7.2) or found via SEO.

### Project Structure Notes

- **New route directory**: `apps/web/src/routes/content/` — first content route. Architecture specifies `content/$slug.tsx`.
- **New component directory**: `apps/web/src/components/content/` — editorial-specific components
- **New mobile directory**: `apps/mobile/src/app/content/` — content screens
- **New migration**: `supabase/migrations/00025_content_pages.sql`
- **New CSS files**: 1 page + 2 component CSS files, all following existing BEM patterns
- **New shared types**: `packages/shared/src/types/content.ts`
- **New shared hooks**: `packages/shared/src/hooks/useContent.ts`

### References

- [Source: epics.md#Story 7.1 — Editorial Content Pages acceptance criteria]
- [Source: architecture.md — `content/$slug.tsx` route defined in feature mapping table]
- [Source: architecture.md — "Content & SEO: SSR via TanStack Start, content/$slug.tsx route, structured data"]
- [Source: architecture.md — "Vanilla CSS with BEM naming, CSS custom properties" constraint]
- [Source: architecture.md — "Row-Level Security (RLS): All Supabase tables require RLS policies"]
- [Source: prd.md#FR9 — "Visitors can read editorial content pages (guides, comparisons, reviews)"]
- [Source: prd.md#FR11 — "Visitors can see clear affiliate disclosure on every page displaying products"]
- [Source: prd.md#FR34 — "The system can render all pages server-side with complete HTML for search engine crawlers"]
- [Source: prd.md#FR37 — "Content editors can publish and manage editorial content pages"]
- [Source: prd.md#FR38 — "Content pages can include internal links to product pages and related editorial content"]
- [Source: ux-design-specification.md — Editorial Luxe mode: serif headings, generous whitespace, editorial typography]
- [Source: ux-design-specification.md — Dual typeface: Cormorant Garamond (headings) + Inter (body)]
- [Source: 6-8-deep-linking-universal-links.md — Previous story patterns, barrel exports, testing approach]
- [Source: CLAUDE.md — "No Tailwind CSS", BEM, Prettier, ESLint, conventional commits]

## Dev Agent Record

### Agent Model Used

claude-opus-4-6

### Debug Log References

- Migration uses `content_page_type` and `content_page_status` enums (not plain text) for type safety at the DB level.
- Used `isomorphic-dompurify` (not plain `dompurify`) for SSR compatibility with marked HTML sanitization.
- Used `.inputValidator()` (not `.validator()`) for TanStack Start Server Functions — matching existing pattern in `getProduct.ts`.
- ESLint flagged unnecessary escape `\[` in regex character class — fixed to `[` (JS allows unescaped `[` inside character classes).
- Mobile content screen uses plain text rendering for Markdown MVP — a full RN markdown library can be added in future iteration.
- `content` query keys added to the shared `queryKeys` factory in `constants.ts` for cache consistency.
- Seed data row inserted for `best-running-shoes-2026` guide to enable immediate testing.

### Completion Notes List

- Created `supabase/migrations/20260330000000_content_pages.sql` — `content_pages` table with `content_page_type` enum (guide, comparison, review), `content_page_status` enum (draft, published, archived), RLS (public read for published, service_role full access), indexes, updated_at trigger, and seed data.
- Created `packages/shared/src/types/content.types.ts` — `ContentPage`, `ContentType`, `ContentStatus`, `ContentListParams`, `ContentListResult` types. Exported from `types/index.ts`.
- Created `packages/shared/src/clients/content.ts` — `getContentPageBySlug()` and `getContentPages()` data functions with snake_case→camelCase mapping. Defense-in-depth published status filter. Exported from `clients/index.ts`.
- Created `packages/shared/src/hooks/useContent.ts` — `contentDetailQueryOptions()` (10min stale) and `contentListQueryOptions()` (5min stale) following existing `useProducts.ts` pattern. Exported from `hooks/index.ts`.
- Added `content` query keys to `packages/shared/src/utils/constants.ts` — `content.all()`, `content.detail(slug)`, `content.list(params)`.
- Created `apps/web/src/server/getContent.ts` — `getContentBySlugFn` and `getContentListFn` Server Functions using `createServerFn({ method: "GET" })` with `.inputValidator()`.
- Installed `marked@17.0.4` and `isomorphic-dompurify@3.4.0` in apps/web.
- Created `apps/web/src/components/content/MarkdownRenderer.tsx` — Splits markdown at `{{product:ID}}` boundaries, renders text segments via marked→DOMPurify→safe HTML, renders product segments as `<ContentProductCard>`. External links get `target="_blank" rel="noopener noreferrer"`.
- Created `apps/web/src/components/content/ContentProductCard.tsx` — Inline horizontal product card for editorial embeds. Fetches live product data from Violet.io API via `productDetailQueryOptions` + `getProductFn` Server Function (same data pipeline as product detail pages). Shows skeleton loading, error fallback with text link, and full card with image/name/price/CTA.
- Created `apps/web/src/components/content/AffiliateDisclosure.tsx` — Legally required affiliate disclosure banner (FR11). Rendered as `<aside role="note">`.
- Created `apps/web/src/routes/content/$slug.tsx` — SSR content page with loader, head (meta tags, canonical, Open Graph, JSON-LD Article), pending/error components, and full editorial layout (type badge, title, author, date, disclosure, hero image, markdown body).
- Created `apps/web/src/styles/pages/content.css` — BEM `.content-page` block with editorial typography (Cormorant Garamond headings, Inter body), 720px max-width, markdown descendant selectors (h2, h3, p, blockquote, code, pre, lists, links, images), responsive breakpoints.
- Created `apps/web/src/styles/components/content-product-card.css` — BEM `.content-product-card` with horizontal layout (desktop), stacked (mobile), skeleton and error states.
- Created `apps/web/src/styles/components/affiliate-disclosure.css` — BEM `.affiliate-disclosure` with muted background, italic text.
- Updated `apps/web/src/styles/index.css` — Added 3 new CSS imports (affiliate-disclosure, content-product-card, content page).
- Created `apps/mobile/src/app/content/_layout.tsx` — Stack navigator for content screens.
- Created `apps/mobile/src/app/content/[slug].tsx` — Mobile content screen with Supabase fetch, type badge, title, meta, disclosure, plain text body rendering.
- Created `apps/web/src/__tests__/content.test.ts` — 26 tests: `splitContentWithEmbeds` (8 tests), `renderMarkdownToHtml` (11 tests including XSS prevention), content query keys (3 tests), content SEO meta tags (3 tests), affiliate disclosure contract (1 test).
- All 333 web tests pass (307 existing + 26 new). `bun run fix-all` exits 0.

### Change Log

- 2026-03-17: Story 7.1 implementation complete — editorial content pages with Supabase CMS, SSR rendering, Markdown+DOMPurify pipeline, product embeds, affiliate disclosure, and mobile screen.
- 2026-03-18: Code review fixes — [C1] ContentProductCard rewritten to use Violet.io API via `productDetailQueryOptions` + `getProductFn` instead of non-existent `products` table. [H1] Fixed `skeleton-shimmer` → `skeleton-pulse` animation reference. [H2] Added 4 missing tests (SEO meta tags + affiliate disclosure). [M1] Explicit column selects in content data functions. [M2] Added `published_at` defense-in-depth filter on mobile. [M3] Updated File List.

### File List

- `supabase/migrations/20260330000000_content_pages.sql` (CREATE)
- `packages/shared/src/types/content.types.ts` (CREATE)
- `packages/shared/src/clients/content.ts` (CREATE)
- `packages/shared/src/hooks/useContent.ts` (CREATE)
- `apps/web/src/server/getContent.ts` (CREATE)
- `apps/web/src/components/content/MarkdownRenderer.tsx` (CREATE)
- `apps/web/src/components/content/ContentProductCard.tsx` (CREATE)
- `apps/web/src/components/content/AffiliateDisclosure.tsx` (CREATE)
- `apps/web/src/routes/content/$slug.tsx` (CREATE)
- `apps/web/src/styles/pages/content.css` (CREATE)
- `apps/web/src/styles/components/content-product-card.css` (CREATE)
- `apps/web/src/styles/components/affiliate-disclosure.css` (CREATE)
- `apps/mobile/src/app/content/_layout.tsx` (CREATE)
- `apps/mobile/src/app/content/[slug].tsx` (CREATE)
- `apps/web/src/__tests__/content.test.ts` (CREATE)
- `packages/shared/src/types/index.ts` (UPDATE — added content type exports)
- `packages/shared/src/hooks/index.ts` (UPDATE — added content hook exports)
- `packages/shared/src/clients/index.ts` (UPDATE — added content data function exports)
- `packages/shared/src/utils/constants.ts` (UPDATE — added content query keys)
- `apps/web/src/styles/index.css` (UPDATE — added 3 new CSS imports)
- `apps/web/src/routeTree.gen.ts` (UPDATE — auto-generated route tree)
- `apps/web/package.json` (UPDATE — added marked, isomorphic-dompurify)
- `bun.lock` (UPDATE — lockfile)
