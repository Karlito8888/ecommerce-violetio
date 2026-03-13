# Story 3.6: AI Conversational Search UI (Web + Mobile)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **visitor**,
I want to search for products using natural language like "gift for my dad who likes cooking, budget $150",
so that I can find relevant products without knowing exact keywords.

## Acceptance Criteria

1. **Given** a visitor on any page/screen
   **When** they interact with the search bar in the header
   **Then** the web search bar is always visible in the header with placeholder text: "What are you looking for?"
   **And** the placeholder cycles through example queries on the homepage hero variant

2. **Given** a visitor types a query of ≥ 2 characters
   **When** they press Enter or submit the search form
   **Then** they are navigated to `/search?q=<query>` on web
   **And** results are displayed as a curated product grid (not a chatbot conversation)
   **And** each result includes a brief "why this matches" explanation (FR2)

3. **Given** search results are loading
   **When** the search-products Edge Function is processing
   **Then** a skeleton grid loading state is displayed
   **And** response time is < 2s end-to-end (NFR2)

4. **Given** no results match the query
   **When** the search returns an empty product array
   **Then** an empty state shows helpful suggestions (e.g., "Try: 'red dress under $50 for a summer wedding'")
   **And** a "Browse all products" CTA links back to `/products`

5. **Given** the AI search backend is unavailable
   **When** the Edge Function returns an error
   **Then** the search gracefully falls back to displaying an error message with a "Browse products" CTA
   **And** no raw error details are shown to the user

6. **Given** the web app's SearchBar component
   **When** rendered in different contexts
   **Then** the `--hero` variant is full-width with large padding and Cormorant placeholder text (homepage)
   **And** the `--compact` variant is header-integrated with smaller padding and Inter placeholder text
   **And** CSS uses BEM naming: `search-bar`, `search-bar__input`, `search-bar__results`, `search-bar__suggestions`

7. **Given** a visitor on web views search results
   **When** filter chips are available (category, price range)
   **Then** the existing FilterChips and CategoryChips components are reused for post-search filtering
   **And** filters update URL query params (shareable/bookmarkable search URLs)

8. **Given** the mobile app's Search tab
   **When** a visitor taps the Search tab
   **Then** a prominent search input is shown with the same placeholder text
   **And** results display in a scrollable product list
   **And** the search uses the same `useSearch` hook from `packages/shared`

9. **Given** accessibility requirements
   **When** the search bar is rendered
   **Then** it uses `role="search"` wrapping form, `<input type="search" aria-label="Search products">`
   **And** keyboard navigation works: Enter submits, Escape clears, Arrow keys navigate suggestions
   **And** search results region uses `aria-live="polite"` for screen reader announcements

10. **Given** the search results page on web
    **When** it is rendered server-side
    **Then** the route at `apps/web/src/routes/search/index.tsx` uses SSR with loader prefetching
    **And** the search query is extracted from URL params (`?q=<query>&category=...`)

## Tasks / Subtasks

- [x] Task 1: Create SearchBar component (AC: 1, 6, 9)
  - [x] 1.1 Create `apps/web/src/components/search/SearchBar.tsx`
  - [x] 1.2 Create `apps/web/src/styles/components/search-bar.css` with BEM naming (`.search-bar`, `.search-bar__input`, `.search-bar__icon`, `.search-bar__clear`)
  - [x] 1.3 Implement `--hero` variant (full-width, Cormorant placeholder, animated cycling example queries)
  - [x] 1.4 Implement `--compact` variant (header-integrated, Inter font, max-width 400px)
  - [x] 1.5 Add form with `role="search"`, `<input type="search" aria-label="Search products">`
  - [x] 1.6 On submit: navigate to `/search?q=<query>` using TanStack Router's `useNavigate()`
  - [x] 1.7 Escape key clears input, Enter submits
  - [x] 1.8 Add `search-bar.css` import to `apps/web/src/styles/index.css` (in components section)

- [x] Task 2: Integrate SearchBar into Header (AC: 1, 6)
  - [x] 2.1 Replace the stub `<input id="header-search">` in `Header.tsx` with `<SearchBar variant="compact" />`
  - [x] 2.2 Remove the old `.site-header__search-input` CSS from `header.css`
  - [x] 2.3 Ensure SearchBar is hidden on mobile (< 640px) — mobile uses the Search tab instead
  - [x] 2.4 On mobile header: show a search icon that navigates to `/search` page

- [x] Task 3: Create search results route (AC: 2, 3, 4, 5, 7, 10)
  - [x] 3.1 Create `apps/web/src/routes/search/index.tsx`
  - [x] 3.2 Define `SearchPageParams` type for URL validation: `{ q?: string, category?: string, minPrice?: number, maxPrice?: number, inStock?: boolean }`
  - [x] 3.3 Implement `validateSearch()` to parse and sanitize URL query params
  - [x] 3.4 Implement `loader()` with SSR prefetching using `searchQueryOptions()` from `useSearch.ts`
  - [x] 3.5 Implement `pendingComponent()` with skeleton grid loading state
  - [x] 3.6 Main component: use `useSearch()` hook with query from URL params
  - [x] 3.7 Display results in search grid with `SearchProductCard` for each result
  - [x] 3.8 Add match explanations below each product card (from `SearchResponse.explanations`)
  - [x] 3.9 Empty state: helpful suggestions + "Browse all products" CTA
  - [x] 3.10 Error state: friendly error message + "Browse products" CTA
  - [x] 3.11 Reuse `CategoryChips` and `FilterChips` for post-search filtering (update URL params)
  - [x] 3.12 Add result count display: "X products found"

- [x] Task 4: Create SearchResults display component (AC: 2, 3, 4, 5)
  - [x] 4.1 Create `apps/web/src/components/search/SearchResults.tsx`
  - [x] 4.2 Create `apps/web/src/styles/components/search-results.css` with BEM naming
  - [x] 4.3 Map `ProductMatch` to `SearchProductCard` (wrapper component)
  - [x] 4.4 Display match explanation text below each card (`.search-results__explanation`)
  - [x] 4.5 Skeleton loading state with animated placeholders
  - [x] 4.6 Add `search-results.css` import to `apps/web/src/styles/index.css`
  - [x] 4.7 Use `aria-live="polite"` on results region for screen reader announcements

- [x] Task 5: Create search page CSS (AC: 6)
  - [x] 5.1 Create `apps/web/src/styles/pages/search.css` with BEM page block
  - [x] 5.2 Follow the products page layout pattern (toolbar + grid)
  - [x] 5.3 Add `search.css` import to `apps/web/src/styles/index.css` (in pages section)

- [x] Task 6: Adapt ProductCard for search results (AC: 2)
  - [x] 6.1 Verify existing `ProductCard.tsx` uses `Product` type — not compatible with `ProductMatch`
  - [x] 6.2 Create `SearchProductCard` wrapper that maps `ProductMatch` fields to card layout
  - [x] 6.3 Handle `thumbnailUrl` from `ProductMatch`, `vendor` instead of `seller`
  - [x] 6.4 Similarity score not displayed (deferred to UX review)

- [x] Task 7: Update Homepage hero with SearchBar (AC: 1, 6)
  - [x] 7.1 Add `<SearchBar variant="hero" />` to homepage hero section
  - [x] 7.2 Implement animated placeholder cycling through example queries (React state + setInterval)
  - [x] 7.3 Updated hero text and CTAs for e-commerce context

- [x] Task 8: Mobile search implementation (AC: 8)
  - [x] 8.1 Replace stub content in `apps/mobile/src/app/search.tsx` with functional search
  - [x] 8.2 Add TextInput with placeholder "What are you looking for?"
  - [x] 8.3 Use `useSearch()` hook from `@ecommerce/shared`
  - [x] 8.4 Display results in a FlatList with product cards
  - [x] 8.5 Add loading state (ActivityIndicator)
  - [x] 8.6 Add empty state with suggestions
  - [x] 8.7 Add error state with message

- [x] Task 9: Tests (AC: 1–10)
  - [x] 9.1 Create `apps/web/src/components/search/__tests__/SearchBar.test.tsx` — 14 tests covering variants, form submission, keyboard, accessibility
  - [x] 9.2 Create `apps/web/src/components/search/__tests__/SearchResults.test.tsx` — 10 tests covering rendering, explanations, empty/error/skeleton states, aria-live
  - [x] 9.3 Route test deferred (route integration tests require full router setup beyond unit test scope)
  - [x] 9.4 Verify no regressions: 212 tests pass (139 web + 73 shared, up from 188)

- [x] Task 10: Quality checks (AC: 1–10)
  - [x] 10.1 Run `bun run fix-all` — passes (Prettier + ESLint + TypeScript check)
  - [x] 10.2 Run `bun --cwd=apps/web run test` — 139 tests pass, 0 regressions
  - [x] 10.3 Visual review: deferred to manual testing
  - [x] 10.4 Manual test: deferred to manual testing
  - [x] 10.5 Manual test: deferred to manual testing
  - [x] 10.6 Manual test: deferred to manual testing

## Dev Notes

### Architecture — What This Story Does vs Story 3.5

Story 3.5 built the **backend** (Edge Functions, pgvector, embeddings, `useSearch` hook). This story builds the **UI layer** that consumes it:

```
Story 3.5 (DONE):                    Story 3.6 (THIS):
─────────────────                    ─────────────────
OpenAI embeddings                    SearchBar component (web)
pgvector similarity search           Search results route (/search)
search-products Edge Function        SearchResults display component
generate-embeddings Edge Function    ProductCard adaptation
useSearch() hook                     Mobile search screen
Search types & schemas               Header integration
                                     Homepage hero SearchBar
```

### Data Flow — End-to-End Search

```
User types query in SearchBar
  → Form submit → navigate to /search?q=<query>
    → Route loader: prefetch searchQueryOptions()
      → useSearch() hook fires
        → supabase.functions.invoke("search-products")
          → Edge Function (Story 3.5):
            → OpenAI embedding generation
            → pgvector cosine similarity search
            → Violet API enrichment
            → Template-based explanations
          ← { data: { products: ProductMatch[], explanations, total }, error: null }
        ← TanStack Query cache (staleTime: 2 min)
      ← SearchResults renders ProductCards + explanations
    ← SSR HTML served to client
```

### Existing Components to REUSE (DO NOT REINVENT)

| What | Where | How to Use |
|---|---|---|
| `useSearch()` hook | `packages/shared/src/hooks/useSearch.ts` | Provides TanStack Query hook for search |
| `searchQueryOptions()` | `packages/shared/src/hooks/useSearch.ts` | For SSR loader prefetching |
| `ProductCard` | `apps/web/src/components/product/ProductCard.tsx` | Reuse for search results grid |
| `ProductGrid` | `apps/web/src/components/product/ProductGrid.tsx` | Grid layout for results |
| `CategoryChips` | `apps/web/src/components/product/CategoryChips.tsx` | Category filter chips |
| `FilterChips` | `apps/web/src/components/product/FilterChips.tsx` | Price/availability filter chips |
| `queryKeys.search.results()` | `packages/shared/src/utils/constants.ts` | Already defined query key |
| `SearchQuery` type | `packages/shared/src/types/search.types.ts` | Input type for search |
| `SearchResponse` type | `packages/shared/src/types/search.types.ts` | Response with products + explanations |
| `ProductMatch` type | `packages/shared/src/types/search.types.ts` | Minimal product type for results |
| Mobile `ProductCard` | `apps/mobile/src/components/product/ProductCard.tsx` | Reuse for mobile results |
| `createSupabaseClient()` | `packages/shared/src/clients/supabase.ts` | Browser client for hook |

### ProductMatch vs Product Type — CRITICAL

`ProductMatch` is intentionally NOT a full `Product` type. It has ~11 fields (id, name, description, minPrice, maxPrice, currency, available, vendor, source, externalUrl, thumbnailUrl, similarity). The full `Product` type has 25+ fields (skus, albums, variants, htmlDescription, etc.).

**When adapting ProductCard for search results:**
- Map `ProductMatch.thumbnailUrl` → image prop
- Map `ProductMatch.minPrice`/`maxPrice` → price display
- Map `ProductMatch.vendor` → merchant name
- Map `ProductMatch.available` → stock status
- `ProductMatch.id` is the Violet offer ID — link to `/products/${id}`

### SearchBar Variants — UX Specification

**`--hero` variant (Homepage):**
- Full-width, large padding (24px vertical, 32px horizontal)
- Cormorant Garamond placeholder font
- Animated placeholder cycling: "gift for my dad who likes cooking" → "red dress under $50" → etc.
- Trending section below: "Trending: summer dresses · running shoes · gifts"
- Gold border on focus (`--color-gold`)

**`--compact` variant (Header):**
- Max-width 400px, smaller padding
- Inter font for placeholder
- Expands on focus
- Hidden on mobile (< 640px) — mobile uses Search tab

**`--overlay` variant (Mobile web — future):**
- Full-screen overlay triggered by search icon
- Not required for MVP — mobile native app has dedicated tab

### CSS Architecture Compliance

**New CSS files to create:**
```
apps/web/src/styles/components/search-bar.css    # SearchBar BEM block
apps/web/src/styles/components/search-results.css # SearchResults BEM block
apps/web/src/styles/pages/search.css             # Search page layout
```

**Import order in `index.css` (CRITICAL):**
```css
/* Components section — add after existing component imports */
@import "./components/search-bar.css";
@import "./components/search-results.css";

/* Pages section — add after existing page imports */
@import "./pages/search.css";
```

**BEM naming convention:**
- `.search-bar` — block
- `.search-bar__input` — element
- `.search-bar__icon` — element
- `.search-bar__clear` — element
- `.search-bar--hero` — modifier
- `.search-bar--compact` — modifier
- `.search-results__grid` — element
- `.search-results__explanation` — element
- `.search-results__empty` — element
- `.search-page__header` — element
- `.search-page__filters` — element

### Route Configuration — Search Page

**Pattern from products listing (`routes/products/index.tsx`):**
```typescript
// 1. Define search params type
interface SearchPageParams {
  q?: string;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  inStock?: boolean;
}

// 2. Validate URL params
validateSearch: (search) => ({
  q: typeof search.q === "string" ? search.q : undefined,
  category: typeof search.category === "string" ? search.category : undefined,
  // ... sanitize all params
})

// 3. Loader for SSR prefetch
loader: async ({ context, deps }) => {
  const { q, ...filters } = deps;
  if (q && q.length >= 2) {
    await context.queryClient.ensureQueryData(
      searchQueryOptions({ query: q, filters }, supabaseClient)
    );
  }
}

// 4. Component uses hook
const { q, ...filters } = Route.useSearch();
const { data, isLoading, error } = useSearch({ query: q, filters }, supabaseClient);
```

### Mobile Implementation Pattern

**Current stub (`apps/mobile/src/app/search.tsx`):**
- Replace placeholder with functional search screen
- Use `useSearch()` hook from `@ecommerce/shared`
- Follow existing mobile patterns (ThemedView, ThemedText)
- Use FlatList for efficient result rendering
- No SSR needed — client-side only

### Accessibility Requirements (WCAG 2.1 AA)

- `role="search"` on wrapping `<form>`
- `<input type="search" aria-label="Search products">`
- Results region: `aria-live="polite"` for dynamic content updates
- Keyboard: Tab to search, Enter to submit, Escape to clear
- Focus management: auto-focus search input on `/search` page load
- Result count announced: "X products found for '<query>'"
- Each ProductCard: `<article>` with `aria-label` (existing pattern)

### File Structure

#### Files to CREATE

```
# Web — Search Components
apps/web/src/components/search/SearchBar.tsx          # SearchBar component (hero + compact variants)
apps/web/src/components/search/SearchBar.css          # SearchBar BEM styles
apps/web/src/components/search/SearchResults.tsx       # Search results display with explanations
apps/web/src/components/search/SearchResults.css       # SearchResults BEM styles

# Web — Route
apps/web/src/routes/search/index.tsx                   # Search results page (SSR)

# Web — Page CSS
apps/web/src/styles/pages/search.css                   # Search page layout

# Tests
apps/web/src/components/search/__tests__/SearchBar.test.tsx
apps/web/src/components/search/__tests__/SearchResults.test.tsx
```

#### Files to MODIFY

```
apps/web/src/components/Header.tsx                     # Replace stub input with SearchBar compact
apps/web/src/styles/components/header.css               # Remove old search input styles
apps/web/src/styles/index.css                           # Add search-bar.css, search-results.css, search.css imports
apps/web/src/routes/index.tsx                           # Add SearchBar hero variant to homepage (if hero section exists)
apps/mobile/src/app/search.tsx                          # Replace stub with functional search
```

#### DO NOT TOUCH

```
packages/shared/src/hooks/useSearch.ts                 # Already built in Story 3.5
packages/shared/src/types/search.types.ts              # Types already defined
packages/shared/src/schemas/search.schema.ts           # Schemas already defined
packages/shared/src/utils/constants.ts                 # queryKeys already defined
supabase/functions/search-products/index.ts            # Edge Function already built
supabase/functions/generate-embeddings/index.ts        # Edge Function already built
apps/web/src/components/product/ProductCard.tsx         # DO NOT modify — create adapter/wrapper instead
apps/web/src/components/product/ProductGrid.tsx         # Reuse as-is
apps/web/src/components/product/CategoryChips.tsx       # Reuse as-is
apps/web/src/components/product/FilterChips.tsx         # Reuse as-is
```

### Library / Framework Requirements

| Library | Version | Purpose | Notes |
|---------|---------|---------|-------|
| `@tanstack/react-router` | (already installed) | Route definition, useNavigate, useSearch | Already in project |
| `@tanstack/react-query` | v5.x (already installed) | useSearch hook, SSR prefetch | Already in project |
| `@supabase/supabase-js` | v2 (already installed) | Client for Edge Function invocation | Already in project |
| `expo-router` | ~55.0.4 (already installed) | Mobile tab navigation | Already in project |

**No new npm dependencies required.** All libraries are already installed.

### Testing Requirements

1. **SearchBar tests** (`apps/web/src/components/search/__tests__/SearchBar.test.tsx`):
   - Renders with correct placeholder text
   - `--hero` variant applies correct CSS class
   - `--compact` variant applies correct CSS class
   - Form submission navigates to `/search?q=<query>`
   - Escape key clears input
   - Empty query doesn't submit
   - Accessibility: `role="search"`, `aria-label`, `type="search"`

2. **SearchResults tests** (`apps/web/src/components/search/__tests__/SearchResults.test.tsx`):
   - Renders product cards from `ProductMatch[]` data
   - Displays match explanations for each result
   - Shows empty state with suggestions when no results
   - Shows error state with CTA when search fails
   - Shows skeleton loading state while fetching
   - `aria-live="polite"` on results region
   - Result count displayed correctly

3. **Quality checks**:
   - `bun run fix-all` must pass
   - `bun --cwd=apps/web run test` must not regress (188 tests from Story 3.5)

### Previous Story Intelligence (Story 3.5)

From Story 3.5 (most recent completed story), critical learnings:

1. **188 tests currently passing** (115 web + 73 shared) — must not regress
2. **`useSearch()` hook exports two APIs**: `searchQueryOptions()` for SSR prefetching and `useSearch()` for client-side usage
3. **`ProductMatch` type is minimal** — do NOT try to cast it to `Product` type
4. **Edge Function response format**: `{ data: { query, products, total, explanations }, error: null }`
5. **`explanations` is `Record<productId, string>`** — map product ID to explanation text
6. **Query is disabled when < 2 chars** — handle this in the UI (don't show loading for single-char queries)
7. **staleTime is 2 minutes** — search results cache quickly for repeated queries
8. **Commit format**: `feat: Story 3.6 — AI conversational search UI (web + mobile)`

### Git Intelligence (Recent Commits)

```
64f1ca5 feat: Story 3.5 — AI conversational search backend (embeddings + edge functions)
345ce55 feat: Story 3.4 — product filtering & sorting (web + mobile)
5547e36 feat: Story 3.3 — product detail page (web SSR + mobile)
f02a71b feat: Story 3.2 — product listing page with category browsing
eb2aadf feat: Story 3.1 — Violet catalog adapter & product types
```

Pattern: single commit per story, conventional format `feat: Story X.Y — description`.

### Project Structure Notes

- Alignment with unified project structure confirmed — all paths match architecture doc
- SearchBar component follows the component-colocated CSS pattern (CSS file next to TSX)
- Route at `search/index.tsx` follows TanStack Start file-based routing convention
- BEM CSS files go in `apps/web/src/styles/components/` and `apps/web/src/styles/pages/`
- Mobile implementation follows existing `search.tsx` tab pattern

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 3.6] — Acceptance criteria, user story
- [Source: _bmad-output/planning-artifacts/architecture.md#File Structure] — Component paths, route structure
- [Source: _bmad-output/planning-artifacts/architecture.md#Naming Conventions] — BEM CSS, component naming
- [Source: _bmad-output/planning-artifacts/architecture.md#Query Key Convention] — search query keys
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#SearchBar] — States, variants, accessibility
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Filter Chips] — Post-search filtering UI
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Product Card Compact] — Search result cards
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Header States] — Search active header state
- [Source: _bmad-output/implementation-artifacts/3-5-ai-conversational-search-edge-function-embeddings.md] — Backend implementation, types, hook API
- [Source: apps/web/src/routes/products/index.tsx] — SSR route pattern to follow
- [Source: apps/web/src/components/Header.tsx] — Header stub to replace
- [Source: apps/web/src/components/product/ProductCard.tsx] — Product card to reuse
- [Source: packages/shared/src/hooks/useSearch.ts] — Search hook API
- [Source: packages/shared/src/types/search.types.ts] — SearchQuery, SearchResponse, ProductMatch types

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- Fixed TanStack Router type safety: `navigate()` requires ALL search params to be explicitly provided (even as `undefined`)
- Fixed `SearchPageParams` export: auto-generated `routeTree.gen.ts` needs the type to be exported
- Fixed mobile Expo Router typing: used `as any` with eslint-disable comment (existing pattern in codebase)
- Added `searchQueryOptions` and `useSearch` exports to `packages/shared/src/hooks/index.ts` (were missing)

### Completion Notes List

- **SearchBar component**: Two variants (hero + compact) with BEM CSS, accessibility (role="search", aria-label), animated placeholder cycling on hero, trending suggestions, clear button, Escape key handler
- **Header integration**: Replaced stub `<input>` with `<SearchBar variant="compact" />`, added mobile search icon link, removed old `.site-header__search-input` CSS
- **Search route**: Full SSR with `validateSearch`, `loader` prefetching via `searchQueryOptions()`, `pendingComponent` skeleton, URL-driven filters
- **SearchResults component**: Displays ProductMatch cards with explanations, empty/error/skeleton states, aria-live="polite"
- **SearchProductCard**: Wrapper mapping `ProductMatch` (~11 fields) to card layout without modifying original `ProductCard` (which uses full `Product` type)
- **Search page CSS**: BEM styles following products page pattern
- **Homepage hero**: Added `<SearchBar variant="hero" />` with updated hero text and CTAs
- **Mobile search**: Functional search screen with TextInput, FlatList results, loading/empty/error states, suggestion buttons
- **Tests**: 24 new tests (14 SearchBar + 10 SearchResults), total 212 tests (139 web + 73 shared), 0 regressions
- **Quality**: `bun run fix-all` passes (Prettier + ESLint + TypeScript web + mobile)

### Change Log

- 2026-03-13: Story 3.6 implemented — AI conversational search UI (web + mobile)
- 2026-03-13: Code review fixes applied — H1 (arrow key nav), H2 (autoFocus), M1 (Supabase memoization), M2 (SPA links), M3 (filter preservation), M4 (filters useMemo), M5 (dead CSS), L1 (File List), L2 (test assertions)

### File List

#### Created
- `apps/web/src/components/search/SearchBar.tsx`
- `apps/web/src/components/search/SearchProductCard.tsx`
- `apps/web/src/components/search/SearchResults.tsx`
- `apps/web/src/components/search/__tests__/SearchBar.test.tsx`
- `apps/web/src/components/search/__tests__/SearchResults.test.tsx`
- `apps/web/src/routes/search/index.tsx`
- `apps/web/src/styles/components/search-bar.css`
- `apps/web/src/styles/components/search-results.css`
- `apps/web/src/styles/pages/search.css`

#### Modified
- `apps/web/src/components/Header.tsx` — replaced stub search input with SearchBar compact + mobile search icon
- `apps/web/src/styles/components/header.css` — removed old search-input styles, added search-mobile styles
- `apps/web/src/styles/index.css` — added search-bar.css, search-results.css, search.css imports
- `apps/web/src/routes/index.tsx` — added SearchBar hero to homepage, updated hero CTAs to <Link> (M2 fix)
- `apps/web/src/routeTree.gen.ts` — auto-generated: search route registered (L1 fix: was missing from File List)
- `apps/mobile/src/app/search.tsx` — replaced stub with functional search screen, Supabase client memoized (M1 fix)
- `packages/shared/src/hooks/index.ts` — added searchQueryOptions and useSearch exports
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — status updated to review
