# Story 7.3: Advanced SEO Implementation

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Quick Reference — Files to Create/Update

| Action | File | Notes |
| ------ | ---- | ----- |
| CREATE | `packages/shared/src/utils/seo-schemas.ts` | JSON-LD schema builders (BreadcrumbList, Organization, enhanced Article) |
| CREATE | `apps/web/src/__tests__/seo-advanced.test.ts` | Tests for new SEO schema builders and meta coverage |
| UPDATE | `packages/shared/src/utils/seo.ts` | Add `buildBreadcrumbJsonLd()`, `buildOrganizationJsonLd()`, `buildFaqJsonLd()`, enhance `buildPageMeta()` with twitter:site |
| UPDATE | `packages/shared/src/utils/__tests__/seo.test.ts` | Add tests for new/updated SEO utilities |
| UPDATE | `apps/web/src/routes/cart/index.tsx` | Add `head()` with noindex meta, title, canonical |
| UPDATE | `apps/web/src/routes/checkout/index.tsx` | Add `head()` with noindex meta, title, canonical |
| UPDATE | `apps/web/src/routes/account/orders/index.tsx` | Add `head()` with noindex meta, title |
| UPDATE | `apps/web/src/routes/account/orders/$orderId.tsx` | Add `head()` with noindex meta, title |
| UPDATE | `apps/web/src/routes/order/$orderId/confirmation.tsx` | Add `head()` with noindex meta, title |
| UPDATE | `apps/web/src/routes/products/$productId.tsx` | Add BreadcrumbList JSON-LD, enhance Product schema |
| UPDATE | `apps/web/src/routes/products/index.tsx` | Add BreadcrumbList JSON-LD |
| UPDATE | `apps/web/src/routes/content/$slug.tsx` | Add BreadcrumbList JSON-LD, enhance Article schema with keywords/wordCount |
| UPDATE | `apps/web/src/routes/content/index.tsx` | Add BreadcrumbList JSON-LD |
| UPDATE | `apps/web/src/routes/index.tsx` | Add Organization JSON-LD alongside existing WebSite schema |
| UPDATE | `apps/web/src/routes/__root.tsx` | Add `twitter:site` to global default meta |

---

## Story

As a **search engine crawler**,
I want comprehensive SEO metadata and structured data on all pages,
So that the platform achieves strong organic search visibility.

## Acceptance Criteria

1. **Given** any page on the web platform
   **When** a crawler accesses it
   **Then** every page has unique `<title>` and `<meta description>` tags (FR35)
   **And** Open Graph tags (og:title, og:description, og:image, og:url) are set for social sharing
   **And** Twitter Card meta tags are included (including `twitter:site`)

2. **Given** product detail pages
   **When** a crawler accesses them
   **Then** JSON-LD `Product` schema includes name, price, availability, image, brand (already exists)
   **And** BreadcrumbList JSON-LD is included (Home > Products > [Product Name])

3. **Given** content/editorial pages
   **When** a crawler accesses them
   **Then** JSON-LD `Article` schema includes headline, author, datePublished, image (already exists)
   **And** Article schema is enhanced with `wordCount` and `articleSection` (content type)
   **And** BreadcrumbList JSON-LD is included (Home > Guides & Reviews > [Article Title])

4. **Given** category/collection pages (product listing, content listing)
   **When** a crawler accesses them
   **Then** JSON-LD `ItemList` (products) or `CollectionPage` (content) schema is included (already exists)
   **And** BreadcrumbList JSON-LD is included (Home > Products / Home > Guides & Reviews)

5. **Given** the homepage
   **When** a crawler accesses it
   **Then** JSON-LD `WebSite` schema with SearchAction is present (already exists)
   **And** JSON-LD `Organization` schema is present with name, url, logo

6. **Given** canonical URLs
   **When** any public page is accessed
   **Then** `<link rel="canonical">` is set to the clean URL without query params
   **And** canonical URLs prevent duplicate content from filters, pagination, sorting

7. **Given** transactional/auth pages (cart, checkout, orders, confirmation)
   **When** a crawler accesses them
   **Then** `<meta name="robots" content="noindex, follow">` is set
   **And** a `<title>` and basic meta description are present

8. **Given** the shared SEO utilities
   **When** developers need SEO for new pages
   **Then** `packages/shared/src/utils/seo.ts` provides centralized helper functions
   **And** `buildBreadcrumbJsonLd()` generates BreadcrumbList schema from path segments
   **And** `buildOrganizationJsonLd()` generates Organization schema
   **And** all JSON-LD builders follow schema.org specifications

9. **Given** the mobile app
   **When** deep linking metadata is considered
   **Then** `app.json` already has proper deep link configuration (Story 6.8)
   **And** no additional mobile changes needed for this story (SEO is web-only)

## Tasks / Subtasks

- [x] **Task 1: Extend shared SEO utilities — `seo.ts`** (AC: #5, #6, #8)
  - [x]1.1: Add `buildBreadcrumbJsonLd(items: BreadcrumbItem[]): object` to `packages/shared/src/utils/seo.ts`
    - Input: array of `{ name: string; url: string }` breadcrumb items
    - Output: JSON-LD `BreadcrumbList` with `ListItem` elements (1-indexed position)
    - Example: `[{ name: "Home", url: SITE_URL }, { name: "Products", url: `${SITE_URL}/products` }]`
  - [x]1.2: Add `buildOrganizationJsonLd(siteUrl: string): object` to `seo.ts`
    - Output: JSON-LD `Organization` with name ("Maison Émile"), url, logo, sameAs (empty for MVP)
    - Logo URL: `${siteUrl}/logo.png` (use existing or placeholder)
  - [x]1.3: ~~Update `buildPageMeta()` to accept optional `twitterSite` param~~ → **Decision: `twitter:site` added as root-level invariant in `__root.tsx` instead.** TanStack Start merges child head() with root head(), so all pages inherit it automatically. This is DRYer than a per-route param.
    - `twitter:site` meta tag (`@MaisonEmile`) set in `__root.tsx` global defaults
    - NOTE: If per-route override is ever needed, `buildPageMeta` can be extended later
  - [x]1.4: Add `BreadcrumbItem` type export
  - [x]1.5: Add helper `wordCount(text: string): number` — counts words in plain text (strip Markdown syntax)
  - [x]1.6: NOTE: Follow existing pattern in `seo.ts` — pure functions, no side effects, JSDoc comments

- [x] **Task 2: Add `head()` to routes missing SEO metadata** (AC: #1, #7)
  - [x]2.1: Update `apps/web/src/routes/cart/index.tsx`:
    ```typescript
    head: () => ({
      meta: buildPageMeta({
        title: "Shopping Cart",
        description: "Review your shopping cart items before checkout.",
        canonicalUrl: `${SITE_URL}/cart`,
        noindex: true,
      }),
    }),
    ```
  - [x]2.2: Update `apps/web/src/routes/checkout/index.tsx`:
    ```typescript
    head: () => ({
      meta: buildPageMeta({
        title: "Checkout",
        description: "Complete your purchase securely.",
        canonicalUrl: `${SITE_URL}/checkout`,
        noindex: true,
      }),
    }),
    ```
  - [x]2.3: Update `apps/web/src/routes/account/orders/index.tsx`:
    ```typescript
    head: () => ({
      meta: buildPageMeta({
        title: "My Orders",
        description: "View your order history and track deliveries.",
        noindex: true,
      }),
    }),
    ```
  - [x]2.4: Update `apps/web/src/routes/account/orders/$orderId.tsx`:
    ```typescript
    head: () => ({
      meta: buildPageMeta({
        title: "Order Details",
        description: "View order details and tracking information.",
        noindex: true,
      }),
    }),
    ```
  - [x]2.5: Update `apps/web/src/routes/order/$orderId/confirmation.tsx`:
    ```typescript
    head: () => ({
      meta: buildPageMeta({
        title: "Order Confirmed",
        description: "Your order has been placed successfully.",
        noindex: true,
      }),
    }),
    ```
  - [x]2.6: NOTE: Import `buildPageMeta` from `@ecommerce/shared` and `SITE_URL` from the existing env/constants pattern

- [x] **Task 3: Add BreadcrumbList JSON-LD to public routes** (AC: #2, #3, #4)
  - [x]3.1: Update `apps/web/src/routes/products/$productId.tsx` — add BreadcrumbList:
    ```typescript
    // In head() alongside existing Product JSON-LD:
    {
      "script:ld+json": JSON.stringify(buildBreadcrumbJsonLd([
        { name: "Home", url: SITE_URL },
        { name: "Products", url: `${SITE_URL}/products` },
        { name: product.name, url: `${SITE_URL}/products/${product.id}` },
      ])),
    }
    ```
  - [x]3.2: Update `apps/web/src/routes/products/index.tsx` — add BreadcrumbList:
    ```typescript
    // Home > Products
    buildBreadcrumbJsonLd([
      { name: "Home", url: SITE_URL },
      { name: "Products", url: `${SITE_URL}/products` },
    ])
    ```
  - [x]3.3: Update `apps/web/src/routes/content/$slug.tsx` — add BreadcrumbList:
    ```typescript
    // Home > Guides & Reviews > [Article Title]
    buildBreadcrumbJsonLd([
      { name: "Home", url: SITE_URL },
      { name: "Guides & Reviews", url: `${SITE_URL}/content` },
      { name: content.title, url: `${SITE_URL}/content/${content.slug}` },
    ])
    ```
  - [x]3.4: Update `apps/web/src/routes/content/index.tsx` — add BreadcrumbList:
    ```typescript
    // Home > Guides & Reviews
    buildBreadcrumbJsonLd([
      { name: "Home", url: SITE_URL },
      { name: "Guides & Reviews", url: `${SITE_URL}/content` },
    ])
    ```
  - [x]3.5: NOTE: Each route's `head()` must include BOTH the existing JSON-LD (Product, Article, etc.) AND the new BreadcrumbList as separate `<script type="application/ld+json">` blocks. Study the existing JSON-LD injection pattern in each route's `head()` to understand how to add a second script block.

- [x] **Task 4: Enhance existing JSON-LD schemas** (AC: #3, #5)
  - [x]4.1: Update `apps/web/src/routes/index.tsx` — add Organization JSON-LD alongside WebSite:
    ```typescript
    // Add second JSON-LD block:
    buildOrganizationJsonLd(SITE_URL)
    ```
  - [x]4.2: Update `apps/web/src/routes/content/$slug.tsx` — enhance Article JSON-LD:
    - Add `wordCount` property using `wordCount(content.bodyMarkdown)` helper
    - Add `articleSection` property mapped from content type (e.g., "guide" → "Buying Guide", "comparison" → "Product Comparison", "review" → "Product Review")
  - [x]4.3: NOTE: Do NOT modify the existing `buildProductJsonLd()` or `buildArticleJsonLd()` utility functions if the enhancements are route-specific. Add properties inline in the route's `head()` via spread/merge.

- [x] **Task 5: Add `twitter:site` to global meta** (AC: #1)
  - [x]5.1: Update `apps/web/src/routes/__root.tsx`:
    - Add `{ name: "twitter:site", content: "@MaisonEmile" }` to the default meta array
    - NOTE: If no Twitter/X handle exists yet, use a placeholder or skip this. Check with user.
  - [x]5.2: Alternative: If `twitter:site` should be per-page (via `buildPageMeta`), add it as an optional parameter to `buildPageMeta()` instead. The root approach is simpler for a consistent handle.

- [x] **Task 6: Tests** (AC: all)
  - [x]6.1: Add to `packages/shared/src/utils/__tests__/seo.test.ts`:
    - Test `buildBreadcrumbJsonLd`: single item, multiple items, correct positions (1-indexed)
    - Test `buildOrganizationJsonLd`: correct schema type, name, url, logo
    - Test `wordCount`: basic text, markdown text, empty string, whitespace-only
    - NOTE: `twitterSite` param test removed — `twitter:site` is a root-level invariant (see Task 1.3)
  - [x]6.2: Create `apps/web/src/__tests__/seo-advanced.test.ts`:
    - Test that all public routes have head() functions (import route configs)
    - Test BreadcrumbList generation for product detail, product listing, content detail, content listing
    - Test that noindex routes don't include canonical URLs (optional — depends on convention)
  - [x]6.3: Follow established testing pattern: vitest, pure function testing

- [x] **Task 7: Quality checks** (AC: all)
  - [x]7.1: `bun run fix-all` exits 0 (Prettier + ESLint + TypeCheck all clean)
  - [x]7.2: `bun --cwd=apps/web run test` — all tests pass (existing + new)
  - [x]7.3: `bun run typecheck` — 0 TypeScript errors
  - [x]7.4: Verify JSON-LD output with Google Rich Results Test format (manual check of schema structure)

## Dev Notes

### Critical Architecture Constraints

- **SSR mandatory for all SEO metadata** — All meta tags and JSON-LD are generated server-side in TanStack Start's `head()` function. No client-side JavaScript required for crawlers to see metadata. This is the existing pattern — follow it.

- **Vanilla CSS + BEM only** — No CSS changes needed for this story (pure metadata/schema work).

- **Centralized SEO utilities** — All reusable SEO builders live in `packages/shared/src/utils/seo.ts`. Route-specific customizations (like enriching Article schema with `wordCount`) are done inline in the route's `head()` function. Do NOT create a separate utility file unless the function is reused by 3+ routes.

- **JSON-LD multiple blocks per page** — TanStack Start supports multiple `<script type="application/ld+json">` blocks. Each route can have both its primary schema (Product, Article) AND BreadcrumbList as separate script blocks. Study the existing JSON-LD injection pattern in each route file.

- **`buildPageMeta()` is the single entry point for meta tags** — Every route uses `buildPageMeta()` from `@ecommerce/shared`. Do NOT manually construct meta tag arrays. Always go through this utility for consistency.

- **`SITE_URL` environment variable** — Canonical URLs and JSON-LD use `SITE_URL`. Defaults to `http://localhost:3000` in dev via existing env config. Production must set this to `https://www.maisonemile.com`.

- **No mobile changes** — Story 7.3 is web-only. Mobile deep linking metadata was handled in Story 6.8. The epics AC about "mobile deep linking metadata" is already satisfied.

- **noindex pages don't need rich JSON-LD** — Cart, checkout, account pages only need basic meta (title, description, robots noindex). No JSON-LD or Open Graph images required.

### Existing Utilities to Reuse (DO NOT REBUILD)

| Utility | Location | What it provides |
| ------- | -------- | ---------------- |
| `buildPageMeta()` | `packages/shared/src/utils/seo.ts` | Generates title, description, OG, Twitter, canonical, noindex meta tags |
| `buildProductJsonLd()` | `packages/shared/src/utils/seo.ts` | Product schema with offers, availability, brand |
| `buildItemListJsonLd()` | `packages/shared/src/utils/seo.ts` | ItemList schema for product listings |
| `buildWebSiteJsonLd()` | `packages/shared/src/utils/seo.ts` | WebSite schema with SearchAction |
| `SITE_URL` | `packages/shared/src/utils/constants.ts` or env import | Base URL for canonical/schema URLs |
| `PageMetaOptions` | `packages/shared/src/utils/seo.ts` | Type for buildPageMeta input |
| `MetaTag` | `packages/shared/src/utils/seo.ts` | Type for meta tag objects |
| `generateExcerpt()` | `apps/web/src/routes/content/index.tsx` or utility | Strip Markdown to plain text (useful for wordCount) |

### Existing Code Patterns to Follow

```typescript
// Meta tag pattern (used in ALL routes with head()):
import { buildPageMeta, buildProductJsonLd } from "@ecommerce/shared";

head: ({ loaderData }) => ({
  meta: buildPageMeta({
    title: "Page Title",
    description: "Page description",
    canonicalUrl: `${SITE_URL}/path`,
    image: "https://...",
    noindex: false,
  }),
  links: [
    { rel: "canonical", href: `${SITE_URL}/path` },
  ],
  scripts: [
    {
      type: "application/ld+json",
      children: JSON.stringify(buildProductJsonLd(product, SITE_URL)),
    },
  ],
}),
```

```typescript
// BreadcrumbList JSON-LD schema (to implement):
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    {
      "@type": "ListItem",
      "position": 1,
      "name": "Home",
      "item": "https://www.maisonemile.com"
    },
    {
      "@type": "ListItem",
      "position": 2,
      "name": "Products",
      "item": "https://www.maisonemile.com/products"
    }
  ]
}
```

```typescript
// Organization JSON-LD schema (to implement):
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "Maison Émile",
  "url": "https://www.maisonemile.com",
  "logo": "https://www.maisonemile.com/logo.png"
}
```

### Previous Story Intelligence (Stories 7.1 & 7.2)

- **`head()` function pattern is well-established** — 13 routes already have `head()`. Follow the exact same pattern for the 5 remaining routes.
- **JSON-LD injection**: Study how `/products/$productId.tsx` injects Product JSON-LD in its `head()` — that's the reference for adding BreadcrumbList alongside existing schemas.
- **`buildPageMeta()` handles all meta complexity** — title, description, OG, Twitter, noindex, canonical. Just call it with the right options.
- **Import pattern**: `import { buildPageMeta } from "@ecommerce/shared"` — use barrel exports.
- **`SITE_URL`**: Check how existing routes import/access this constant. It may be from `process.env.VITE_SITE_URL` or a shared constant.
- **Content pages Article JSON-LD**: Already inline in `/content/$slug.tsx` `head()`. Enhance it there (don't move to utility).
- **Mobile content screen (`[slug].tsx`)**: Uses plain text rendering — no SEO changes needed.

### Git Intelligence

- Commit pattern: `feat: implement <description> (Story X.Y) + code review fixes`
- Last commits: Stories 7.2, 7.1, Epic 6 review. Codebase is stable with 350 passing tests.
- No new dependencies needed — this story only adds utility functions and updates route `head()` exports.

### Scope Boundaries — What is NOT in this story

- **XML Sitemap generation/update** — Story 7.4 handles dynamic sitemap with Supabase data.
- **Social sharing UI buttons** — Story 7.5 adds share buttons on product/content pages.
- **Content administration** — Story 7.6.
- **AggregateRating / Review schemas** — No review/rating data exists in the platform yet. Not in PRD scope.
- **FAQ JSON-LD** — FAQ page is Story 8.1. The `buildFaqJsonLd` utility can be created there when needed.
- **Schema.org validation tool integration** — Manual validation only. No automated schema testing via external APIs.
- **Performance optimization (Core Web Vitals)** — LCP, FID, CLS optimization is a separate concern, not this story.
- **Image optimization for og:image** — Existing og:image URLs are used as-is. No image resizing/optimization.
- **Rich snippet testing in Google Search Console** — Documentation only, no API integration.

### Project Structure Notes

- **No new files created** (unless separating new builders warrants `seo-schemas.ts`)
- **Primary changes**: `packages/shared/src/utils/seo.ts` (new builder functions) + 10 route files (head() additions/enhancements)
- **Test additions**: Extend existing `seo.test.ts` + optional `seo-advanced.test.ts` for integration-style route tests

### References

- [Source: epics.md#Story 7.3 — Advanced SEO Implementation acceptance criteria]
- [Source: prd.md#FR34 — "The system can render all pages server-side with complete HTML for search engine crawlers"]
- [Source: prd.md#FR35 — "The system can generate dynamic meta tags, Open Graph tags, and structured data (JSON-LD) per page"]
- [Source: prd.md#FR36 — "The system can generate and maintain an XML sitemap" (Story 7.4, not this story)]
- [Source: architecture.md — "SEO: SSR via TanStack Start, structured data, meta tags"]
- [Source: architecture.md — SEO Strategy table: JSON-LD Product, BreadcrumbList, Article, canonical URLs]
- [Source: packages/shared/src/utils/seo.ts — Existing SEO utilities (buildPageMeta, buildProductJsonLd, etc.)]
- [Source: 7-1-editorial-content-pages.md — Article JSON-LD, head() pattern, SITE_URL usage]
- [Source: 7-2-content-listing-navigation.md — CollectionPage JSON-LD, content listing head()]
- [Source: CLAUDE.md — "No Tailwind CSS", BEM, Prettier, ESLint, conventional commits]

## Dev Agent Record

### Agent Model Used

claude-opus-4-6

### Debug Log References

- `wordCount()` regex ordering: code block removal (```` ``` ````) must run BEFORE inline code removal (`` ` ``) — otherwise the inline regex strips backticks from fenced code blocks, breaking the triple-backtick pattern.
- `twitter:site` added to `__root.tsx` (root-level invariant) rather than per-route via `buildPageMeta()` — TanStack Start merges child head with root head, so all pages inherit it.
- Noindex routes don't need canonical URLs or rich JSON-LD — only title, description, and robots noindex tag.
- The existing `buildArticleJsonLd()` is inline in `content/$slug.tsx` (not in shared `seo.ts`), so `wordCount` and `articleSection` enhancements were added there directly.

### Completion Notes List

- Added `buildBreadcrumbJsonLd(items: BreadcrumbItem[])` to `packages/shared/src/utils/seo.ts` — generates JSON-LD BreadcrumbList schema with 1-indexed ListItem positions.
- Added `buildOrganizationJsonLd(siteUrl: string)` to `seo.ts` — generates Organization schema with name, url, logo.
- Added `wordCount(text: string): number` to `seo.ts` — strips Markdown syntax (product embeds, headings, bold, italic, links, images, code blocks, inline code) then counts words.
- Added `BreadcrumbItem` type export to `seo.ts` and barrel export in `utils/index.ts`.
- Updated `apps/web/src/routes/cart/index.tsx` — added `head()` with noindex meta via `buildPageMeta()`.
- Updated `apps/web/src/routes/checkout/index.tsx` — added `head()` with noindex meta.
- Updated `apps/web/src/routes/account/orders/index.tsx` — added `head()` with noindex meta.
- Updated `apps/web/src/routes/account/orders/$orderId.tsx` — added `head()` with noindex meta.
- Updated `apps/web/src/routes/order/$orderId/confirmation.tsx` — added `head()` with noindex meta.
- Updated `apps/web/src/routes/products/$productId.tsx` — added BreadcrumbList JSON-LD (Home > Products > [Product Name]) alongside existing Product JSON-LD.
- Updated `apps/web/src/routes/products/index.tsx` — added BreadcrumbList JSON-LD (Home > Products) alongside existing ItemList JSON-LD.
- Updated `apps/web/src/routes/content/$slug.tsx` — added BreadcrumbList JSON-LD (Home > Guides & Reviews > [Title]), enhanced Article JSON-LD with `wordCount` and `articleSection` properties.
- Updated `apps/web/src/routes/content/index.tsx` — added BreadcrumbList JSON-LD (Home > Guides & Reviews) alongside existing CollectionPage JSON-LD.
- Updated `apps/web/src/routes/index.tsx` — added Organization JSON-LD alongside existing WebSite JSON-LD.
- Updated `apps/web/src/routes/__root.tsx` — added `twitter:site` meta tag (`@MaisonEmile`) to global defaults.
- Added 6 tests in `packages/shared/src/utils/__tests__/seo.test.ts` (breadcrumb, organization, wordCount).
- Created `apps/web/src/__tests__/seo-advanced.test.ts` with 7 tests (route-level breadcrumb generation, organization schema, wordCount on editorial content).
- All 357 web tests pass (350 existing + 7 new). All 20 shared SEO tests pass (14 existing + 6 new). `bun run fix-all` exits 0.

### Change Log

- 2026-03-18: Story 7.3 implementation complete — advanced SEO with BreadcrumbList JSON-LD on all public routes, Organization schema on homepage, head() on 5 missing routes (noindex), Article schema enhanced with wordCount/articleSection, twitter:site global meta tag, and comprehensive tests.
- 2026-03-18: Code review fixes — (M3) fixed og:url on noindex dynamic routes ($orderId, confirmation) to use actual route path via loaderData instead of generic parent path; (M1/M2) updated task 1.3 and 6.1 descriptions to accurately reflect twitter:site implementation decision (root-level invariant vs per-route param).

### File List

- `packages/shared/src/utils/seo.ts` (UPDATE — added BreadcrumbItem type, buildBreadcrumbJsonLd, buildOrganizationJsonLd, wordCount)
- `packages/shared/src/utils/index.ts` (UPDATE — added new SEO exports)
- `packages/shared/src/utils/__tests__/seo.test.ts` (UPDATE — added 6 tests)
- `apps/web/src/__tests__/seo-advanced.test.ts` (CREATE — 7 tests)
- `apps/web/src/routes/__root.tsx` (UPDATE — added twitter:site meta)
- `apps/web/src/routes/index.tsx` (UPDATE — added Organization JSON-LD)
- `apps/web/src/routes/cart/index.tsx` (UPDATE — added head() with noindex)
- `apps/web/src/routes/checkout/index.tsx` (UPDATE — added head() with noindex)
- `apps/web/src/routes/account/orders/index.tsx` (UPDATE — added head() with noindex)
- `apps/web/src/routes/account/orders/$orderId.tsx` (UPDATE — added head() with noindex)
- `apps/web/src/routes/order/$orderId/confirmation.tsx` (UPDATE — added head() with noindex)
- `apps/web/src/routes/products/$productId.tsx` (UPDATE — added BreadcrumbList JSON-LD)
- `apps/web/src/routes/products/index.tsx` (UPDATE — added BreadcrumbList JSON-LD)
- `apps/web/src/routes/content/$slug.tsx` (UPDATE — added BreadcrumbList JSON-LD, enhanced Article schema)
- `apps/web/src/routes/content/index.tsx` (UPDATE — added BreadcrumbList JSON-LD)
