# Story 8.6: Legal & Compliance Pages

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Quick Reference — Files to Create/Update

| Action | File | Notes |
| ------ | ---- | ----- |
| CREATE | `supabase/migrations/20260405000000_legal_content_type.sql` | Add 'legal' to content_page_type enum, seed 3 legal pages |
| CREATE | `apps/web/src/routes/legal/$slug.tsx` | Legal page route (SSR, dynamic slug: privacy, terms, cookies) |
| CREATE | `apps/web/src/server/getLegalContent.ts` | Server function: fetch legal page by slug |
| CREATE | `apps/web/src/components/legal/CookieConsentBanner.tsx` | GDPR cookie consent banner (accept/decline, no dark patterns) |
| CREATE | `apps/web/src/hooks/useCookieConsent.ts` | Hook: manage cookie consent state via localStorage |
| CREATE | `apps/web/src/styles/pages/legal.css` | BEM styles for `.legal-page` block |
| CREATE | `apps/web/src/styles/components/cookie-consent.css` | BEM styles for `.cookie-consent` block |
| UPDATE | `apps/web/src/styles/index.css` | Import legal.css and cookie-consent.css |
| UPDATE | `apps/web/src/components/Footer.tsx` | Update Legal section links to point to `/legal/privacy`, `/legal/terms`, add `/legal/cookies` |
| UPDATE | `apps/web/src/routes/__root.tsx` | Add CookieConsentBanner to root layout |
| CREATE | `apps/mobile/src/app/legal/` | Mobile legal page directory |
| CREATE | `apps/mobile/src/app/legal/_layout.tsx` | Legal section layout with back navigation |
| CREATE | `apps/mobile/src/app/legal/[slug].tsx` | Mobile legal page (WebView or rendered markdown) |
| UPDATE | `apps/mobile/src/app/settings/_layout.tsx` | Add legal links to settings screen |
| CREATE | `apps/web/src/__tests__/legal-pages.test.ts` | Tests for legal content fetching and cookie consent logic |

---

## Story

As a **visitor**,
I want to access privacy policy, terms of service, and cookie policy pages,
So that I understand how my data is handled and my rights.

## Acceptance Criteria

1. **Given** legal requirements for an e-commerce platform
   **When** a visitor navigates to legal pages
   **Then** the following static pages are available: Privacy Policy (`/legal/privacy`), Terms of Service (`/legal/terms`), Cookie Policy (`/legal/cookies`)

2. **Given** the existing `content_pages` table
   **When** legal pages are stored
   **Then** the `content_page_type` enum is extended with `'legal'` value
   **And** pages are seeded with type `'legal'`, status `'published'`, appropriate slugs (`privacy`, `terms`, `cookies`)

3. **Given** the web footer component
   **When** a visitor views any page
   **Then** the Legal section in the footer links to: Privacy Policy (`/legal/privacy`), Terms of Service (`/legal/terms`), Cookie Preferences (`/legal/cookies`)

4. **Given** EU GDPR compliance requirements
   **When** a visitor first accesses the web platform
   **Then** a cookie consent banner is displayed at the bottom of the page
   **And** the banner offers equal-weight "Accept" and "Decline" buttons (no dark patterns — same size, same visual weight)
   **And** no pre-checked boxes are present
   **And** the banner includes a link to the Cookie Policy page
   **And** accepting or declining stores the preference in localStorage (no third-party cookies)
   **And** the banner does not reappear for the session after user choice

5. **Given** privacy policy content (FR54, GDPR Article 5(1)(c))
   **When** a visitor reads the privacy policy
   **Then** it clearly states: data collected (email, name, address for orders), data usage purposes, third-party services (Supabase, Violet.io, Stripe), user rights (access, correction, deletion), contact method for data requests

6. **Given** the affiliate business model (FR11, FR51, FTC 16 CFR §255)
   **When** legal pages are displayed
   **Then** an affiliate disclosure page/section clearly explains the commission-based business model
   **And** the terms of service reference the affiliate relationship

7. **Given** consumer protection requirements (FR53, EU Consumer Rights Directive 2011/83/EU)
   **When** terms of service are displayed
   **Then** they include: pre-purchase information disclosure, right of withdrawal notice, delivery responsibility (merchants via Violet), platform liability limitations

8. **Given** the mobile app
   **When** a user navigates to settings/profile
   **Then** legal pages (Privacy Policy, Terms of Service, Cookie Policy) are accessible via links in the settings screen
   **And** mobile renders legal content using the shared markdown content from Supabase

9. **Given** App Store compliance requirements
   **When** the app is reviewed
   **Then** the Privacy Policy is hosted on the web domain and linked in app settings
   **And** app privacy labels accurately reflect data collection practices

10. **Given** SEO requirements
    **When** legal pages are rendered on web
    **Then** pages have appropriate `<title>`, `<meta description>`, canonical URLs
    **And** pages include `noindex` meta tag (legal pages should not appear in search results — they are informational, not discovery content)

## Tasks / Subtasks

- [x] **Task 1: Database migration — extend content_page_type enum + seed legal pages** (AC: #1, #2)
  - [x]1.1: Create `supabase/migrations/20260405000000_legal_content_type.sql`:
    - ALTER TYPE `content_page_type` ADD VALUE IF NOT EXISTS `'legal'`
    - **IMPORTANT**: `ALTER TYPE ... ADD VALUE` cannot run inside a transaction block in PostgreSQL. Use a separate statement outside DO $$ blocks.
    - Seed 3 legal pages in `content_pages`:
      1. `slug: 'privacy'`, `title: 'Privacy Policy'`, `type: 'legal'`, `status: 'published'`, `published_at: now()`
      2. `slug: 'terms'`, `title: 'Terms of Service'`, `type: 'legal'`, `status: 'published'`, `published_at: now()`
      3. `slug: 'cookies'`, `title: 'Cookie Policy'`, `type: 'legal'`, `status: 'published'`, `published_at: now()`
    - `body_markdown` for each page should contain comprehensive, realistic legal content:
      - **Privacy Policy**: Data collected (email, name, shipping address for orders), how data is used, third-party services (Supabase for auth/storage, Violet.io for product fulfillment, Stripe for payments), user rights (access, correction, deletion per GDPR), data retention policy, contact for data requests, children's privacy (no data from under 16)
      - **Terms of Service**: Platform description (curated affiliate marketplace), affiliate disclosure (commission on purchases per FTC), user obligations, intellectual property, limitation of liability, merchant responsibility for fulfillment/returns (via Violet.io), governing law, dispute resolution, right of withdrawal per EU Consumer Rights Directive
      - **Cookie Policy**: What cookies are used (authentication session via Supabase, consent preference via localStorage, cart state), no third-party tracking cookies, how to manage preferences, link back to privacy policy
    - `seo_title` and `seo_description` for each page
    - `author: 'Maison Émile'`
    - `ON CONFLICT (slug) DO NOTHING` for idempotent seeding
    - **No tags, no related_slugs, no featured_image_url** for legal pages

  - [x]1.2: Update `packages/shared/src/types/content.types.ts`:
    - Add `'legal'` to the `ContentType` union: `export type ContentType = "guide" | "comparison" | "review" | "legal";`

- [x] **Task 2: Server function for legal content** (AC: #1, #10)
  - [x]2.1: Create `apps/web/src/server/getLegalContent.ts`:
    - Reuse `getContentPageBySlug` from `@ecommerce/shared` — same client function used by editorial content
    - Server function: `getLegalContentFn = createServerFn({ method: "GET" })` with slug input validator
    - The existing `getContentPageBySlug` already filters by `status: 'published'` — no extra filtering needed
    - Follow exact pattern from `getContent.ts` (Story 7.1)
    ```typescript
    import { createServerFn } from "@tanstack/react-start";
    import type { ApiResponse, ContentPage } from "@ecommerce/shared";
    import { getContentPageBySlug, createSupabaseClient } from "@ecommerce/shared";

    export const getLegalContentFn = createServerFn({ method: "GET" })
      .inputValidator((input: string) => input)
      .handler(async ({ data: slug }): Promise<ApiResponse<ContentPage>> => {
        const client = createSupabaseClient();
        const result = await getContentPageBySlug(client, slug);
        if (!result) {
          return { data: null, error: { code: "NOT_FOUND", message: "Legal page not found" } };
        }
        return { data: result, error: null };
      });
    ```

- [x] **Task 3: Web legal page route** (AC: #1, #5, #6, #7, #10)
  - [x]3.1: Create `apps/web/src/routes/legal/$slug.tsx`:
    - **Route pattern**: File-based route at `/legal/$slug` (same pattern as `/content/$slug`)
    - **Loader**: `getLegalContentFn({ data: slug })` — SSR prefetch legal content
    - **Head**: `noindex` meta tag (legal pages shouldn't be indexed), dynamic `<title>` ("Privacy Policy | Maison Émile"), canonical URL
    - **Component structure**:
      - Title heading (h1)
      - Last updated date (from `updatedAt`)
      - Markdown body rendered via `MarkdownRenderer` component (reuse from `/content/$slug`)
      - Footer link back to home
    - **Error handling**: 404-style not-found component if slug doesn't match
    - **Pending state**: Skeleton loader (same pattern as content pages)
    - **BEM class**: `.legal-page`, `.legal-page__title`, `.legal-page__updated`, `.legal-page__body`
    - **NO** AffiliateDisclosure component on legal pages (not a product page)
    - **NO** RelatedContent on legal pages
    - **NO** ShareButton on legal pages
    - **Allowed slugs**: Validate that slug is one of `['privacy', 'terms', 'cookies']` — return 404 for others (defense in depth against content_pages with type != legal)

- [x] **Task 4: Cookie consent banner** (AC: #4)
  - [x]4.1: Create `apps/web/src/hooks/useCookieConsent.ts`:
    - State management via `localStorage` key `cookie-consent`
    - Values: `'accepted'` | `'declined'` | null (not yet chosen)
    - Hook returns: `{ consent: string | null, accept: () => void, decline: () => void, hasChosen: boolean }`
    - On first render, read from `localStorage` — if null, banner should show
    - `accept()` and `decline()` write to `localStorage` and update state
    - **No cookies are set** — only localStorage (ironic but appropriate — we don't use tracking cookies, just auth session cookies managed by Supabase)

  - [x]4.2: Create `apps/web/src/components/legal/CookieConsentBanner.tsx`:
    - **Render condition**: Only show if `consent === null` (user hasn't chosen yet)
    - **Position**: Fixed at bottom of viewport (above footer visually)
    - **Content**:
      - Brief text: "We use cookies for authentication and to remember your preferences. No tracking cookies are used."
      - Link to Cookie Policy: `<Link to="/legal/cookies">Learn more</Link>`
      - Two buttons: "Accept" and "Decline" — **equal visual weight** (same size, same style variant — both outlined or both filled)
    - **Anti-dark-patterns**:
      - Buttons are the same size and color treatment
      - No pre-checked checkboxes
      - Banner is not larger than necessary (UX spec: "No cookie banner larger than necessary")
      - Decline is just as easy as accept
    - **BEM**: `.cookie-consent`, `.cookie-consent__text`, `.cookie-consent__actions`, `.cookie-consent__btn`, `.cookie-consent__link`
    - **Accessibility**: `role="dialog"`, `aria-label="Cookie consent"`, focus management (first interactive element gets focus)
    - **Animation**: Subtle slide-up on appear, fade-out on dismiss

  - [x]4.3: Update `apps/web/src/routes/__root.tsx`:
    - Import and render `<CookieConsentBanner />` after `<Footer />` in the root layout
    - Lazy import is fine (not critical path)

- [x] **Task 5: CSS styles** (AC: #1, #4)
  - [x]5.1: Create `apps/web/src/styles/pages/legal.css`:
    - `.legal-page` — max-width content container (same as `.content-page`)
    - `.legal-page__title` — h1 styling
    - `.legal-page__updated` — muted text showing last update date
    - `.legal-page__body` — markdown content area (reuse `.content-page__body` patterns or extend)
    - Dark theme support (follow existing patterns)
    - Responsive: comfortable reading width on mobile

  - [x]5.2: Create `apps/web/src/styles/components/cookie-consent.css`:
    - `.cookie-consent` — fixed position at bottom, z-index above content but below modals
    - Background: semi-transparent or solid surface color
    - Max-width container, centered
    - `.cookie-consent__actions` — flexbox row with equal-width buttons
    - `.cookie-consent__btn` — same size for both accept and decline
    - `.cookie-consent__btn--accept` and `.cookie-consent__btn--decline` — same visual weight (no primary/secondary distinction)
    - Slide-up animation on entry
    - Dark theme support
    - Mobile: stack buttons vertically, full width

  - [x]5.3: Update `apps/web/src/styles/index.css`:
    - Add import for `pages/legal.css` in the pages section
    - Add import for `components/cookie-consent.css` in the components section

- [x] **Task 6: Update Footer links** (AC: #3)
  - [x]6.1: Update `apps/web/src/components/Footer.tsx`:
    - Change Legal section links from placeholder `"/"` to actual routes:
      - `{ to: "/legal/privacy", label: "Privacy Policy" }`
      - `{ to: "/legal/terms", label: "Terms of Service" }`
      - `{ to: "/legal/cookies", label: "Cookie Preferences" }` (add this new link)
    - Also update Support section links to point to actual routes:
      - `{ to: "/help", label: "FAQ" }` (already implemented in Story 8.1)
      - `{ to: "/help/contact", label: "Contact" }` (already implemented in Story 8.2)
    - **NOTE**: The Shop section links still point to `"/"` — these will be updated when category pages are finalized. Don't touch them now.

- [x] **Task 7: Mobile legal pages** (AC: #8, #9)
  - [x]7.1: Create `apps/mobile/src/app/legal/_layout.tsx`:
    - Stack navigator layout for legal section
    - Header with back button and section title
    - Follow existing mobile layout patterns (e.g., `settings/_layout.tsx`)

  - [x]7.2: Create `apps/mobile/src/app/legal/[slug].tsx`:
    - Dynamic route for legal pages (privacy, terms, cookies)
    - Fetch legal content from Supabase using shared client (`getContentPageBySlug`)
    - Render markdown content — use a simple markdown renderer (e.g., `react-native-markdown-display` or render via `WebView` with the shared markdown content)
    - **Recommended approach**: Use `WebView` pointing to the web legal page URL (simplest, ensures content parity, avoids adding a markdown library to mobile)
    - **Alternative**: Use the Supabase client to fetch content and render with a basic `Text`-based renderer (more native feel, but more work)
    - Loading state: ActivityIndicator
    - Error state: "Unable to load page" message with retry

  - [x]7.3: Update `apps/mobile/src/app/profile.tsx`:
    - Add legal links section to profile/settings screen:
      - "Privacy Policy" → navigates to `/legal/privacy`
      - "Terms of Service" → navigates to `/legal/terms`
      - "Cookie Policy" → navigates to `/legal/cookies`
    - Follow existing settings navigation patterns

- [x] **Task 8: Tests** (AC: #1, #2, #4)
  - [x]8.1: Create `apps/web/src/__tests__/legal-pages.test.ts`:
    - Test `ContentType` includes `'legal'`
    - Test cookie consent hook: initial state is null, accept sets 'accepted', decline sets 'declined', persists across re-renders
    - Test legal content slug validation (only 'privacy', 'terms', 'cookies' accepted)
    - Test footer links point to correct legal routes
    - Follow testing patterns from `content.test.ts`

## Dev Notes

### Existing Infrastructure to Leverage

- **`content_pages` table** (Story 7.1, migration `20260330000000`): Already has slug, title, type (enum), body_markdown, author, published_at, seo_title, seo_description, status. RLS: public read for published, service_role full access. The enum needs `'legal'` added.
- **`getContentPageBySlug()`** (from `packages/shared/src/clients/content.ts`): Fetches a single published content page by slug. Already filters by `status: 'published'` and `published_at <= now()`. Reuse directly — no new client function needed.
- **`MarkdownRenderer` component** (from Story 7.1): `apps/web/src/components/content/MarkdownRenderer.tsx`. Renders markdown body. Reuse for legal page body.
- **`getContent.ts` server function pattern** (Story 7.1): Follow `getContentBySlugFn` pattern for `getLegalContentFn`.
- **`/content/$slug.tsx` route** (Story 7.1): Reference for SSR content page pattern — loader, head, component structure.
- **Footer.tsx**: Already has a "Legal" section with placeholder links. Just update the `to` values.
- **`__root.tsx`**: Root layout where global components (Header, Footer) are rendered. Add CookieConsentBanner here.
- **`contentDetailQueryOptions`** (from `@ecommerce/shared`): Could be reused for legal pages if query caching is desired. But since legal pages change rarely, a simple server function call without TanStack Query may be simpler.

### Architecture Constraints

- **No Tailwind CSS** — use Vanilla CSS + BEM exclusively.
- **Cookie consent**: Use `localStorage` only (no third-party cookie consent libraries — keep it simple). The platform doesn't use tracking cookies, only:
  - Supabase auth session cookie (functional, exempt from consent)
  - localStorage for cart state, preferences, consent itself
- **Equal button treatment for consent banner** — UX spec explicitly prohibits dark patterns: "no 'accept' button larger than 'decline'", "no pre-checked boxes".
- **`ALTER TYPE ... ADD VALUE` quirk**: In PostgreSQL, `ALTER TYPE enum ADD VALUE` cannot be executed inside a transaction block. Supabase migrations run each file as a single transaction. **Workaround**: The `ADD VALUE IF NOT EXISTS` form works in PostgreSQL 13+ — Supabase uses PostgreSQL 15, so this is safe. If the migration runner wraps in a transaction, an alternative is to use a DO block with dynamic SQL: `EXECUTE format('ALTER TYPE %I ADD VALUE IF NOT EXISTS %L', 'content_page_type', 'legal')` — but test this first.
- **Legal content is "legal" type, NOT displayed in editorial content listings** — The existing `getContentPages()` function in `content.ts` can filter by type. The content listing page (`/content/index.tsx`) should naturally exclude legal pages if it filters by editorial types. Verify this doesn't happen — if `getContentPages()` fetches all types, legal pages would appear in the editorial listing. **Fix**: either filter by type in the listing query, or accept that legal pages won't appear because the listing is filtered by editorial categories.
- **Mobile approach**: Prefer `WebView` for legal pages to ensure content parity and avoid adding a markdown rendering library. The settings screen links should use `expo-router` navigation to `/legal/[slug]`.

### Cookie Consent Technical Details

- **What cookies does the platform use?**
  - `sb-*` cookies: Supabase auth session (strictly necessary, exempt from consent)
  - No analytics cookies (no Google Analytics or similar — architecture decision)
  - No advertising/tracking cookies
  - `localStorage`: cart state, user preferences, consent choice, browsing history, recently viewed
- **Consent granularity**: Since we only have functional cookies (auth), the consent banner is informational with accept/decline. Accepting means the user acknowledges the use of functional cookies. Declining means... the same (auth cookies are exempt). The distinction matters for GDPR compliance optics — showing the banner demonstrates good faith.
- **No cookie consent needed on mobile app** — cookie consent banners are a web-specific requirement. Mobile apps use App Tracking Transparency (iOS) separately.

### File Organization

- Legal route: `apps/web/src/routes/legal/$slug.tsx` — separate from `/content/$slug` despite reusing same table, because:
  1. Different URL namespace (`/legal/` vs `/content/`)
  2. No editorial features (no author byline, no share button, no related content, no affiliate disclosure)
  3. Different SEO treatment (`noindex`)
  4. Different visual treatment (simpler, more formal)
- Server function: `apps/web/src/server/getLegalContent.ts` — could reuse `getContentBySlugFn` from `getContent.ts` directly, but a separate function makes the route dependency explicit
- Cookie consent: `apps/web/src/components/legal/CookieConsentBanner.tsx` — under `/legal/` component directory
- Hook: `apps/web/src/hooks/useCookieConsent.ts` — follows existing hooks directory pattern

### Previous Story Intelligence (8.5)

- **Admin pages**: Story 8.5 added health monitoring. No overlap with legal pages, but patterns are useful:
  - BEM naming for admin: `.admin-health__*`. Legal pages should use `.legal-page__*`.
  - CSS dark theme support includes both light/dark variables. Follow same approach.
  - 522 tests passing after Story 8.5 — maintain this baseline.
- **Server function pattern**: `createServerFn({ method: "GET" })` with `.inputValidator()` and `.handler()`. Handler can be inline (no need for separate handler file since no admin auth needed).
- **Root layout**: `__root.tsx` renders Header and Footer. CookieConsentBanner goes after Footer (fixed position, so DOM order matters less, but logically it's last).

### Git Intelligence

- Latest commit: `85d3d97` — Story 8.5 (platform health monitoring)
- Recent pattern: Stories create migration SQL, shared types, shared clients, server functions, route page, CSS, tests
- File naming: migrations use `YYYYMMDD000000_descriptive_name.sql`
- CSS files: pages in `styles/pages/`, components in `styles/components/`

### FTC & Regulatory References

- **FR51**: FTC-compliant affiliate disclosure proximate to all purchase CTAs — already implemented via `AffiliateDisclosure` component (Story 7.1) and footer disclosure. Legal pages reinforce this in Terms of Service.
- **FR53**: Pre-purchase information (total price, delivery estimate, withdrawal rights) — Terms of Service page covers the legal framework; actual implementation is in checkout flow (Story 4.4).
- **FR54**: GDPR data minimization — Privacy Policy page documents this; actual implementation is in guest checkout flow (Story 4.4) and session management.
- **FR11**: Affiliate disclosure — mentioned in epics acceptance criteria. Terms of Service should include clear affiliate model explanation.

### Project Structure Notes

- Web routes: `apps/web/src/routes/legal/$slug.tsx` (new route directory)
- Mobile routes: `apps/mobile/src/app/legal/[slug].tsx` (new, expo-router convention with brackets)
- Content reuse: legal pages share the `content_pages` table with editorial content but are accessed via different routes
- Type extension: `ContentType` union in `packages/shared/src/types/content.types.ts` must be updated

### References

- [Source: epics.md#Story 8.6 — Lines 1336-1354]
- [Source: prd.md#FR51 — FTC-compliant affiliate disclosure]
- [Source: prd.md#FR53 — Consumer protection pre-purchase information]
- [Source: prd.md#FR54 — GDPR data minimization]
- [Source: prd.md#FR55 — Tax calculation during pricing phase]
- [Source: prd.md#Regulatory & Compliance Requirements — Lines 272-282]
- [Source: prd.md#Store Compliance — Lines 503-524 (Apple/Google requirements)]
- [Source: architecture.md#Security — Line 68: PCI compliance via Stripe]
- [Source: ux-design-specification.md#Footer — Lines 1522-1534: Legal section anatomy]
- [Source: ux-design-specification.md#Stage 1 — Line 189: "No cookie banner larger than necessary"]
- [Source: ux-design-specification.md#Transparency — Line 239: "Transparent affiliate disclosure"]
- [Source: ux-design-specification.md#Accessibility — Lines 2634+: WCAG 2.1 Level AA compliance]
- [Source: supabase/migrations/20260330000000_content_pages.sql — content_pages table schema + content_page_type enum]
- [Source: packages/shared/src/types/content.types.ts — ContentType union]
- [Source: packages/shared/src/clients/content.ts — getContentPageBySlug function]
- [Source: apps/web/src/routes/content/$slug.tsx — Editorial content page pattern]
- [Source: apps/web/src/server/getContent.ts — Server function pattern]
- [Source: apps/web/src/components/Footer.tsx — Footer with Legal section placeholder links]
- [Source: apps/web/src/components/content/MarkdownRenderer.tsx — Markdown rendering component]
- [Source: apps/web/src/routes/__root.tsx — Root layout for global components]
- [Source: apps/mobile/src/app/settings/_layout.tsx — Mobile settings navigation]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

### Completion Notes List

- All 8 tasks implemented and verified — 537 tests passing, 0 regressions
- Prettier, ESLint, TypeScript checks all passing (exit code 0)
- Migration extends `content_page_type` enum with 'legal' and seeds 3 comprehensive legal pages (Privacy Policy, Terms of Service, Cookie Policy)
- Legal pages served at `/legal/$slug` via separate route from editorial content — different UX treatment (no author, no share, noindex SEO)
- Cookie consent banner uses equal-weight buttons (anti-dark-pattern per UX spec), localStorage only
- Footer links updated from placeholders to actual routes (legal + support sections)
- CookieConsentBanner mounted in root layout, appears once until user accepts/declines
- Mobile uses WebView approach for content parity — installed `react-native-webview@13.16.1`
- Mobile legal links added to profile/settings screen (visible to all users)
- Route tree regenerated to include `/legal/$slug`

### Change Log

| Date | Author | Changes |
|------|--------|---------|
| 2026-03-22 | Dev Agent | Initial implementation — all 8 tasks |
| 2026-03-22 | Code Review (AI) | H1: Exclude 'legal' type from unfiltered content listings (getContentPages). H2: Rewrote tests with real imports + renderHook. H3: Fixed SSR hydration mismatch in useCookieConsent. M1: WebView injects JS to hide web shell. M2: Restricted originWhitelist. M3/M4: Fixed story docs. |

### File List

- CREATE `supabase/migrations/20260405000000_legal_content_type.sql`
- UPDATE `packages/shared/src/types/content.types.ts`
- CREATE `apps/web/src/server/getLegalContent.ts`
- CREATE `apps/web/src/routes/legal/$slug.tsx`
- CREATE `apps/web/src/hooks/useCookieConsent.ts`
- CREATE `apps/web/src/components/legal/CookieConsentBanner.tsx`
- CREATE `apps/web/src/styles/pages/legal.css`
- CREATE `apps/web/src/styles/components/cookie-consent.css`
- UPDATE `apps/web/src/styles/index.css`
- UPDATE `apps/web/src/components/Footer.tsx`
- UPDATE `apps/web/src/routes/__root.tsx`
- CREATE `apps/mobile/src/app/legal/_layout.tsx`
- CREATE `apps/mobile/src/app/legal/[slug].tsx`
- UPDATE `apps/mobile/src/app/profile.tsx`
- UPDATE `apps/mobile/package.json` (added react-native-webview)
- UPDATE `bun.lock` (lockfile updated from react-native-webview addition)
- CREATE `apps/web/src/__tests__/legal-pages.test.ts`
- UPDATE `apps/web/src/routeTree.gen.ts` (auto-generated)
- UPDATE `packages/shared/src/clients/content.ts` (code review: exclude legal from listings)
- UPDATE `apps/web/src/__tests__/contentAdmin.test.ts` (code review: fix mock for .neq())
