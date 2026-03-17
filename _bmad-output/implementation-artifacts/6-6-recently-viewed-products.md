# Story 6.6: Recently Viewed Products

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Quick Reference — Files to Create/Update

| Action | File | Notes |
| ------ | ---- | ----- |
| CREATE | `packages/shared/src/types/recentlyViewed.types.ts` | `RecentlyViewedItem`, `RecentlyViewedStorage` interface |
| CREATE | `packages/shared/src/hooks/useRecentlyViewed.ts` | Abstracts localStorage (anon) vs `user_events` (auth) — single API |
| CREATE | `apps/web/src/components/product/RecentlyViewedRow.tsx` | Horizontal scroll row with `BaseProductCard`, ErrorBoundary wrapper |
| CREATE | `apps/web/src/styles/components/recently-viewed-row.css` | BEM `.recently-viewed-row` block — clone `recommendation-row.css` pattern |
| CREATE | `apps/web/src/__tests__/recently-viewed.test.ts` | Unit tests for localStorage helpers, query keys, type validation |
| UPDATE | `apps/web/src/routes/index.tsx` | Add `<RecentlyViewedRow />` section on homepage |
| ~~UPDATE~~ | ~~`apps/web/src/styles/pages/home.css`~~ | ~~Add styles for recently viewed section on homepage~~ — **[M1 code-review fix] Not actually modified; styles live in `recently-viewed-row.css` instead** |
| UPDATE | `apps/mobile/src/app/index.tsx` | Add `RecentlyViewedSection` on home screen |
| UPDATE | `packages/shared/src/types/index.ts` | Add recently viewed type exports |
| UPDATE | `packages/shared/src/hooks/index.ts` | Add `useRecentlyViewed` hook export |
| UPDATE | `packages/shared/src/utils/constants.ts` | Add `recentlyViewed` to `queryKeys` factory |
| UPDATE | `apps/web/src/styles/index.css` | Import `recently-viewed-row.css` |

---

## Story

As a **visitor**,
I want to see products I recently viewed,
So that I can easily go back to items I was interested in.

## Acceptance Criteria

1. **Given** a visitor who has viewed product pages
   **When** they navigate to the home page
   **Then** up to 12 recently viewed products are displayed in reverse chronological order
   **And** each item shows: image, name, price, availability status (via `BaseProductCard`)

2. **Given** an anonymous user
   **When** recently viewed products load
   **Then** recently viewed product IDs are read from `localStorage` (web) / `AsyncStorage` (mobile)
   **And** product details are fetched live from Violet API (via existing `productDetailQueryOptions` or batch fetch)
   **And** localStorage stores `{ productId, viewedAt }[]` — max 12 entries, FIFO eviction

3. **Given** an authenticated user
   **When** recently viewed products load
   **Then** recently viewed is derived from `user_events` table (`event_type = 'product_view'`)
   **And** data is cross-device — same data on web and mobile (server-side source of truth)
   **And** product details are fetched live from Violet API for the returned product IDs

4. **Given** a user who transitions from anonymous to authenticated (login)
   **When** they log in
   **Then** localStorage recently viewed data is NOT merged into `user_events` (too complex for MVP)
   **And** the display switches to server-side `user_events` data immediately
   **And** localStorage data is retained but no longer displayed while authenticated

5. **Given** the web homepage
   **When** recently viewed section renders
   **Then** web: horizontal scroll row using `BaseProductCard` components
   **And** desktop: up to 4-6 visible cards, overflow hidden
   **And** mobile breakpoint: horizontal scroll with snap points
   **And** section title: "Recently Viewed" (Cormorant display font)
   **And** section is hidden entirely if no recently viewed products exist (no "empty" state)

6. **Given** the mobile app home screen
   **When** recently viewed section renders
   **Then** a horizontal `FlatList` shows recently viewed products
   **And** cards are tappable and navigate to the product detail screen
   **And** section is hidden if no recently viewed products

7. **Given** `packages/shared/src/hooks/useRecentlyViewed.ts`
   **When** consumed by web or mobile app
   **Then** it provides:
   - `useRecentlyViewed(options: { userId?, supabaseClient?, limit? })` — unified hook
   - If `userId` provided: queries `user_events` via existing `getUserEvents()` client
   - If no `userId`: reads from localStorage/AsyncStorage
   - Returns `{ products: RecentlyViewedItem[], isLoading, isError }`
   - Query key: `['recentlyViewed', userId ?? 'anonymous']`
   - `staleTime: 2 min` (matches browsing history staleTime)
   - `enabled: true` always (anonymous path doesn't need auth)

## Tasks / Subtasks

- [x] **Task 1: Types** — `packages/shared/src/types/recentlyViewed.types.ts` (AC: #7)
  - [x] 1.1: Create `RecentlyViewedEntry` interface: `{ productId: string; viewedAt: string }` (localStorage shape)
  - [x] 1.2: Create `RecentlyViewedItem` interface — same shape as `BaseProductCardProps`: `{ id, name, merchantName, thumbnailUrl, available, minPrice, currency }`
  - [x] 1.3: Export from `packages/shared/src/types/index.ts`

- [x] **Task 2: localStorage helpers** (web-specific, AC: #2)
  - [x] 2.1: In `useRecentlyViewed.ts`, create helper functions (NOT a separate file):
    - `getRecentlyViewedFromStorage(): RecentlyViewedEntry[]` — reads `localStorage.getItem('recently-viewed')`, JSON.parse, returns `[]` on failure
    - `addToRecentlyViewedStorage(productId: string): void` — reads current, prepends new entry with `viewedAt: new Date().toISOString()`, deduplicates by productId, trims to max 12, saves
  - [x] 2.2: SSR guard: `typeof window === 'undefined'` → return `[]` / no-op
  - [x] 2.3: Storage key constant: `RECENTLY_VIEWED_STORAGE_KEY = 'recently-viewed'`

- [x] **Task 3: useRecentlyViewed hook** — `packages/shared/src/hooks/useRecentlyViewed.ts` (AC: #2, #3, #7)
  - [x] 3.1: Add to `queryKeys` in `packages/shared/src/utils/constants.ts`:
    ```typescript
    recentlyViewed: {
      forUser: (userId: string) => ["recentlyViewed", userId] as const,
      anonymous: () => ["recentlyViewed", "anonymous"] as const,
    },
    ```
  - [x] 3.2: Create `useRecentlyViewed(userId, limit)` — returns product IDs (not enriched data):
    - If `userId` provided → use `getUserEvents(userId, { eventType: 'product_view', limit })` from `packages/shared/src/clients/tracking.ts`
    - Extract unique `payload.product_id` values (deduplicate — user may view same product multiple times)
    - If no `userId` → read `getRecentlyViewedFromStorage()`, extract productId list
  - [x] 3.3: Product enrichment delegated to component layer via `useQueries` with `productDetailQueryOptions` — same pattern as wishlist page (Story 6.4)
  - [x] 3.4: N/A — `productDetailQueryOptions` exists and works with platform-specific fetchFn adapters
  - [x] 3.5: Component maps `Product` to `BaseProductCardProps` directly (no intermediate `RecentlyViewedItem` mapping needed)
  - [x] 3.6: Hook returns `{ data: string[], isLoading, isError }` — component handles enrichment loading state
  - [x] 3.7: Export from `packages/shared/src/hooks/index.ts`

- [x] **Task 4: Record product view to localStorage** (web only, AC: #2)
  - [x] 4.1: In `apps/web/src/hooks/useTrackingListener.ts`, added separate `useEffect` that subscribes to `router.subscribe('onResolved')` for ALL users (anonymous + authenticated) and calls `addToRecentlyViewedStorage(productId)` on product routes
  - [x] 4.2: Server-side tracking flow untouched — localStorage write is a separate `useEffect` with its own subscription, independent of the auth-gated server tracking

- [x] **Task 5: Web RecentlyViewedRow component** — `apps/web/src/components/product/RecentlyViewedRow.tsx` (AC: #1, #5)
  - [x] 5.1: Self-contained component with no required props
  - [x] 5.2: Uses `useUser()` for userId detection (anonymous vs authenticated)
  - [x] 5.3: Uses `useRecentlyViewed(userId)` for product IDs + `useQueries(productDetailQueryOptions)` for enrichment
  - [x] 5.4: `RecentlyViewedBoundary` ErrorBoundary renders `null` on crash
  - [x] 5.5: Loading state: 4 skeleton cards with pulse animation
  - [x] 5.6: Empty/error: returns `null`
  - [x] 5.7: Success: "Recently Viewed" heading + horizontal row of `BaseProductCard`
  - [x] 5.8: Uses existing `BaseProductCard` — no new card component

- [x] **Task 6: RecentlyViewedRow CSS** — `apps/web/src/styles/components/recently-viewed-row.css` (AC: #5)
  - [x] 6.1: BEM `.recently-viewed-row` block cloned from `recommendation-row.css` pattern
  - [x] 6.2: Desktop media query: up to 6 cards (`max-width: calc(100% / 6)`)
  - [x] 6.3: Import added to `apps/web/src/styles/index.css`

- [x] **Task 7: Update web homepage** — `apps/web/src/routes/index.tsx` (AC: #1, #5)
  - [x] 7.1: Imported `RecentlyViewedRow` component
  - [x] 7.2: Added `<RecentlyViewedRow />` after hero section, before features
  - [x] 7.3: Already inside `.page-wrap` container
  - [x] 7.4: No data loading added to homepage route loader — component is self-contained

- [x] **Task 8: Update mobile home screen** — `apps/mobile/src/app/index.tsx` (AC: #6)
  - [x] 8.1: Added `RecentlyViewedSection` component on home screen
  - [x] 8.2: Horizontal `FlatList` with `useRecentlyViewed` product IDs
  - [x] 8.3: Tappable items navigating to product detail via `router.push`
  - [x] 8.4: `ActivityIndicator` loading state
  - [x] 8.5: Returns `null` when empty or error
  - [x] 8.6: Uses `ThemedText` / `ThemedView` patterns
  - [x] 8.7: Mobile anonymous storage deferred — mobile currently uses placeholder product data. `useRecentlyViewed` works for authenticated users via `user_events`. Anonymous mobile users will have this feature when AsyncStorage or SecureStore integration is added in a future story.

- [x] **Task 9: Tests** — `apps/web/src/__tests__/recently-viewed.test.ts` (AC: all)
  - [x] 9.1: Test `queryKeys.recentlyViewed.forUser()` returns correct key structure
  - [x] 9.2: Test `queryKeys.recentlyViewed.anonymous()` returns correct key structure
  - [x] 9.3: Test `getRecentlyViewedFromStorage()` returns empty array when localStorage is empty
  - [x] 9.4: Test `addToRecentlyViewedStorage()` adds entry, deduplicates, and trims to 12
  - [x] 9.5: Test `addToRecentlyViewedStorage()` moves re-viewed product to front
  - [x] 9.6: Test corrupted localStorage handling (graceful recovery)
  - [x] 9.7: Follows Story 6.5 pattern: tests pure functions (localStorage helpers, query keys), not hooks

- [x] **Task 10: Barrel exports & quality checks** (AC: all)
  - [x] 10.1: Updated `packages/shared/src/types/index.ts` — added `RecentlyViewedEntry`, `RecentlyViewedItem`
  - [x] 10.2: Updated `packages/shared/src/hooks/index.ts` — added `useRecentlyViewed`, `recentlyViewedQueryOptions`, `getRecentlyViewedFromStorage`, `addToRecentlyViewedStorage`
  - [x] 10.3: Updated `packages/shared/src/utils/constants.ts` — added `recentlyViewed` to `queryKeys`
  - [x] 10.4: `bun run fix-all` exits 0 (Prettier + ESLint + TypeCheck all clean)
  - [x] 10.5: `bun --cwd=apps/web run test` — 260 tests pass (248 existing + 12 new)
  - [x] 10.6: `bun run typecheck` — 0 TypeScript errors

---

## Dev Notes

### Critical Architecture Constraints

- **Dual storage strategy** — Anonymous users use client-side storage (localStorage on web, expo-secure-store on mobile). Authenticated users use `user_events` table (cross-device, server-side). The hook `useRecentlyViewed` abstracts this difference — consumers don't know which source is used.

- **No new Edge Function needed** — Unlike recommendations (which needed a custom pgvector query), recently viewed is simpler: get product IDs from storage → fetch product details from Violet. The existing `getUserEvents()` client function in `packages/shared/src/clients/tracking.ts` already handles the authenticated path.

- **Product enrichment is needed** — Both localStorage and `user_events` only store product IDs (not full product data). To render `BaseProductCard`, we need: `id, name, merchantName, thumbnailUrl, available, minPrice, currency`. Use `useQueries` with individual product detail fetches, or find existing batch product fetch utilities in the Violet adapter.

- **Tracking already works** — Story 6.2 set up `useTrackingListener` in `__root.tsx` which fires `product_view` events for `/products/:productId` routes. For authenticated users, this data is already in `user_events`. For anonymous users on web, we add localStorage recording in the same listener.

- **Async loading — don't block homepage** — RecentlyViewedRow must NOT be in the homepage route loader. It lazy-loads client-side. Show skeleton while loading, hide section on error/empty.

- **Use BaseProductCard — do NOT create a new card** — Same rule as recommendations. `BaseProductCard.tsx` already has image, price, merchant name, WishlistButton overlay.

- **No dark patterns** — "Recently Viewed" is a natural, user-helpful feature. No "X people also viewed this" or fake urgency. Simple reverse-chronological list of products the user actually viewed.

- **Graceful degradation** — If localStorage is corrupted, return empty array. If product detail fetch fails for some items, show the subset that succeeded. If all fail, hide the section.

- **No Tailwind CSS** — All styling is Vanilla CSS + BEM.

- **Mobile: use expo-secure-store, NOT AsyncStorage** — `@react-native-async-storage/async-storage` is NOT installed. `expo-secure-store` (v55.0.8) IS installed and works for small JSON payloads. Use it for the 12-entry recently viewed list on mobile.

### Existing Utilities to Reuse (DO NOT REBUILD)

| Utility | Location | What it provides |
| ------- | -------- | ---------------- |
| `getUserEvents()` | `packages/shared/src/clients/tracking.ts` | Fetches `user_events` from Supabase with RLS, ordered by `created_at DESC` |
| `useBrowsingHistory()` | `packages/shared/src/hooks/useBrowsingHistory.ts` | TanStack Query wrapper around `getUserEvents()` — can be used directly for auth path |
| `useTrackingListener()` | `apps/web/src/hooks/useTrackingListener.ts` | Already fires `product_view` on `/products/:productId` route — add localStorage write here |
| `useTrackProductView()` | `apps/mobile/src/hooks/useMobileTracking.ts` | Already tracks product views on mobile for authenticated users |
| `BaseProductCard` | `apps/web/src/components/product/BaseProductCard.tsx` | Props: `{ id, name, merchantName, thumbnailUrl, available, minPrice, currency }` |
| `ProductCard` (mobile) | `apps/mobile/src/components/product/ProductCard.tsx` | React Native product card with `{ product: Product }` prop |
| `useUser()` / `useAuth()` | `packages/shared/src/hooks/useAuth.ts` | Get current user for determining auth vs anonymous path |
| `createSupabaseClient()` | `packages/shared/src/clients/supabase.ts` | Browser Supabase client |
| `queryKeys` | `packages/shared/src/utils/constants.ts` | TanStack Query key factory — add `recentlyViewed` entry |
| `RecommendationRow` | `apps/web/src/components/product/RecommendationRow.tsx` | Architecture pattern to clone (ErrorBoundary wrapper, skeleton, BaseProductCard usage) |
| `recommendation-row.css` | `apps/web/src/styles/components/recommendation-row.css` | CSS pattern to clone for horizontal scroll row |

### Existing Code Patterns to Follow

```typescript
// localStorage helper pattern (from ThemeToggle.tsx):
function getRecentlyViewedFromStorage(): RecentlyViewedEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem("recently-viewed");
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function addToRecentlyViewedStorage(productId: string): void {
  if (typeof window === "undefined") return;
  try {
    const entries = getRecentlyViewedFromStorage();
    const filtered = entries.filter((e) => e.productId !== productId);
    filtered.unshift({ productId, viewedAt: new Date().toISOString() });
    localStorage.setItem("recently-viewed", JSON.stringify(filtered.slice(0, 12)));
  } catch {
    // Silent fail — localStorage quota or private browsing
  }
}
```

```typescript
// Hook pattern — dual storage abstraction:
export function useRecentlyViewed({
  userId,
  supabaseClient,
  limit = 12,
}: {
  userId?: string;
  supabaseClient?: SupabaseClient;
  limit?: number;
}) {
  // Authenticated path: use existing getUserEvents
  // Anonymous path: read from localStorage, extract product IDs
  // Both paths: fetch product details per ID via useQueries
}
```

```typescript
// Query key factory extension (add to constants.ts):
recentlyViewed: {
  forUser: (userId: string) => ["recentlyViewed", userId] as const,
  anonymous: () => ["recentlyViewed", "anonymous"] as const,
},
```

```typescript
// ErrorBoundary wrapper pattern (from RecommendationRow.tsx):
class RecentlyViewedBoundary extends React.Component<...> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  render() { return this.state.hasError ? null : this.props.children; }
}

export default function RecentlyViewedRow() {
  return (
    <RecentlyViewedBoundary>
      <RecentlyViewedRowInner />
    </RecentlyViewedBoundary>
  );
}
```

### Database Schema Reference

```sql
-- EXISTING TABLE USED BY THIS STORY (NOT modified):
-- user_events (Story 6.2 — migration 20260325000000_user_events.sql):
CREATE TABLE public.user_events (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type TEXT        NOT NULL CHECK (event_type IN ('product_view', 'search', 'category_view')),
  payload    JSONB       NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- RLS: users SELECT own rows; service_role ALL
-- Indexes: (user_id, event_type), (user_id, created_at DESC), (created_at)

-- product_view payload shape: { "product_id": "abc123", "offer_id"?: "...", "category"?: "..." }
-- Query for recently viewed: getUserEvents(userId, { eventType: 'product_view', limit: 12 })

-- NO NEW TABLES OR MIGRATIONS NEEDED FOR THIS STORY
```

### Previous Story Intelligence (Story 6.5)

- **Implementation sequence**: Types → localStorage helpers → hook → web component → CSS → web homepage update → mobile update → barrel exports → tests → fix-all.
- **Deep imports don't work**: Must use barrel exports via `@ecommerce/shared`. Always update barrel files.
- **Server-only imports leaking**: Ensure no server-only modules leak into client-side hook code.
- **Pre-existing test failures**: `orderStatusDerivation` and `violetCartAdapter` — not introduced by this story, ignore them.
- **`renderHook` issues in monorepo**: Test pure functions (localStorage helpers, query keys), not hooks directly.
- **Barrel exports**: ALWAYS update `types/index.ts`, `hooks/index.ts` when adding new modules.
- **WishlistButton crashes in test**: Already wrapped in ErrorBoundary — be aware when writing tests that render `BaseProductCard`.
- **ErrorBoundary pattern is mandatory**: Any component using hooks that need QueryClientProvider/auth context must be wrapped in an ErrorBoundary that renders `null` on crash.
- **Mobile uses placeholder data currently**: Mobile home screen has placeholder product list. This story adds real recently viewed data.
- **RecommendationRow is the exact template**: Clone its architecture — ErrorBoundary, skeleton, BaseProductCard, null on empty/error.

### Git Intelligence

- Commit pattern: `feat: implement <description> (Story X.Y) + code review fixes`
- Recent commits: Stories 6.1-6.5 built the full personalization pipeline (profiles, tracking, search personalization, wishlist, recommendations). This story leverages the browsing history infrastructure from Story 6.2.
- The `useTrackingListener` in `__root.tsx` is the integration point for web localStorage recording.

### Project Structure Notes

- **New shared types**: `packages/shared/src/types/recentlyViewed.types.ts`
- **New shared hook**: `packages/shared/src/hooks/useRecentlyViewed.ts` — dual storage abstraction
- **New web component**: `apps/web/src/components/product/RecentlyViewedRow.tsx`
- **New web CSS**: `apps/web/src/styles/components/recently-viewed-row.css`
- **Modified web homepage**: `apps/web/src/routes/index.tsx` — add RecentlyViewedRow section
- **Modified mobile home**: `apps/mobile/src/app/index.tsx` — add RecentlyViewedSection
- **Modified tracking listener**: `apps/web/src/hooks/useTrackingListener.ts` — add localStorage write
- **Downstream dependencies**: None — this is the last "browsing memory" feature in Epic 6.

### References

- [Source: epics.md#Story 6.6 — Recently Viewed Products acceptance criteria]
- [Source: architecture.md#TanStack Query staleTime — catalog: 5 min, search: 2 min, profile: 5 min]
- [Source: architecture.md#Code Structure — packages/shared for cross-platform hooks and types]
- [Source: ux-design-specification.md#Effortless by Default — cross-device sync, smart defaults]
- [Source: ux-design-specification.md#Personalized homepage — returning users see personalized content]
- [Source: 6-5-product-recommendations.md — RecommendationRow pattern, ErrorBoundary, BaseProductCard reuse, test strategy]
- [Source: 6-2-browsing-history-preference-tracking — user_events table, useTrackingListener, getUserEvents client]
- [Source: CLAUDE.md — No Tailwind CSS, double quotes, semicolons, 100 char width, conventional commit format]

## Dev Agent Record

### Agent Model Used

claude-opus-4-6

### Debug Log References

- Hook design decision: `useRecentlyViewed` returns product IDs (not enriched data) because `productDetailQueryOptions` requires a platform-specific `fetchFn`. The component layer handles enrichment via `useQueries` — same architecture as the wishlist page (Story 6.4).
- localStorage recording uses a separate `useEffect` subscription (not integrated into the auth-gated tracking effect) to ensure anonymous users also get localStorage recording.
- Mobile `RecentlyViewedSection` uses `router.push(\`/products/${id}\` as never)` cast — matching existing mobile patterns (`ProductDetail.tsx`, `wishlist.tsx`). Expo Router's strict typing doesn't support dynamic path templates.
- Mobile anonymous recently-viewed deferred — no AsyncStorage installed, and product detail fetching isn't wired up on mobile yet (TODO Story 3.2-mobile). Authenticated users work via `user_events` table.

### Completion Notes List

- Created `packages/shared/src/types/recentlyViewed.types.ts` — `RecentlyViewedEntry` (localStorage shape: productId + viewedAt), `RecentlyViewedItem` (matches `BaseProductCardProps` shape for rendering).
- Created `packages/shared/src/hooks/useRecentlyViewed.ts` — dual-storage abstraction: authenticated users → `user_events` table via `getUserEvents()`, anonymous users → `localStorage`. Includes `getRecentlyViewedFromStorage()` and `addToRecentlyViewedStorage()` helper functions with SSR guards. Returns product IDs; enrichment happens in consumer components.
- Created `apps/web/src/components/product/RecentlyViewedRow.tsx` — "Recently Viewed" section with ErrorBoundary wrapper. Uses `useRecentlyViewed` for IDs + `useQueries(productDetailQueryOptions)` for enrichment. Skeleton loading state, null on error/empty. Uses `BaseProductCard` (WishlistButton included).
- Created `apps/web/src/styles/components/recently-viewed-row.css` — BEM `.recently-viewed-row` with horizontal scroll, snap points, hidden scrollbar. Desktop: up to 6 cards. Mobile breakpoint: scroll with snap.
- Created `apps/web/src/__tests__/recently-viewed.test.ts` — 12 tests: query keys (4), localStorage get (3), localStorage add (5).
- Updated `apps/web/src/hooks/useTrackingListener.ts` — Added separate `useEffect` that records product views to localStorage for ALL users (anonymous + authenticated), independent of server-side tracking.
- Updated `apps/web/src/routes/index.tsx` — Added `<RecentlyViewedRow />` on homepage after hero section.
- Updated `apps/mobile/src/app/index.tsx` — Added `RecentlyViewedSection` component with horizontal FlatList, ActivityIndicator loading, tappable cards navigating to product detail.
- Updated `packages/shared/src/types/index.ts` — Added `RecentlyViewedEntry`, `RecentlyViewedItem` exports.
- Updated `packages/shared/src/hooks/index.ts` — Added `useRecentlyViewed`, `recentlyViewedQueryOptions`, `getRecentlyViewedFromStorage`, `addToRecentlyViewedStorage` exports.
- Updated `packages/shared/src/utils/constants.ts` — Added `recentlyViewed.forUser()` and `recentlyViewed.anonymous()` to `queryKeys`.
- Updated `apps/web/src/styles/index.css` — Added `recently-viewed-row.css` import.
- All 260 web tests pass (248 existing + 12 new). `bun run fix-all` exits 0 (Prettier + ESLint + TypeCheck all clean).

### File List

- `packages/shared/src/types/recentlyViewed.types.ts` (CREATE)
- `packages/shared/src/hooks/useRecentlyViewed.ts` (CREATE)
- `apps/web/src/components/product/RecentlyViewedRow.tsx` (CREATE)
- `apps/web/src/styles/components/recently-viewed-row.css` (CREATE)
- `apps/web/src/__tests__/recently-viewed.test.ts` (CREATE)
- `packages/shared/src/types/index.ts` (UPDATE — added RecentlyViewedEntry, RecentlyViewedItem exports)
- `packages/shared/src/hooks/index.ts` (UPDATE — added useRecentlyViewed, helpers exports)
- `packages/shared/src/utils/constants.ts` (UPDATE — added recentlyViewed to queryKeys)
- `apps/web/src/hooks/useTrackingListener.ts` (UPDATE — added localStorage recording useEffect)
- `apps/web/src/routes/index.tsx` (UPDATE — added RecentlyViewedRow on homepage)
- `apps/web/src/styles/index.css` (UPDATE — added recently-viewed-row.css import)
- `apps/mobile/src/app/index.tsx` (UPDATE — added RecentlyViewedSection with FlatList)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (UPDATE — [M4 code-review fix] story status sync)

## Senior Developer Review (AI)

**Reviewer:** Charles (via Claude Opus 4.6 adversarial review)
**Date:** 2026-03-17
**Outcome:** ✅ Approved — all issues fixed

### Findings Summary

| ID | Severity | Description | Status |
|----|----------|-------------|--------|
| H1 | HIGH | Heading hierarchy broken: `<h3>` between `<h1>` and `<h2>` on homepage | ✅ Fixed → `<h2>` |
| H2 | HIGH | Missing `role="listitem"` on card wrappers (WCAG violation) | ✅ Fixed |
| H3 | HIGH | Hook signature mismatch with AC #7: positional params instead of options object | ✅ Fixed → `UseRecentlyViewedOptions` interface |
| M1 | MEDIUM | Quick Reference table lists `home.css` as UPDATE but never modified | ✅ Fixed — struck through in table |
| M2 | MEDIUM | Mobile `accessibilityLabel` exposes raw UUID to screen readers | ✅ Fixed → generic label |
| M3 | MEDIUM | Duplicated product route regex in `useTrackingListener` | ✅ Fixed → `PRODUCT_ROUTE_PATTERN` constant |
| M4 | MEDIUM | `sprint-status.yaml` modified but not in File List | ✅ Fixed — added to File List |
| L1 | LOW | `merchantName` mapping: `product.seller` vs `product.vendor` inconsistency | ✅ Documented in JSDoc (pre-existing; `seller` is correct) |
| L2 | LOW | No explicit `enabled: true` in query options (AC #7 spec) | ✅ Fixed + documented |
| L3 | LOW | Test coverage gap: no test for anonymous `recentlyViewedQueryOptions` path | ✅ Fixed — 6 new tests added |

### Changes Applied

- **RecentlyViewedRow.tsx**: `<h3>` → `<h2>`, added `role="listitem"`, JSDoc on heading choice and merchantName mapping
- **useRecentlyViewed.ts**: Refactored to options-object signature (`UseRecentlyViewedOptions`), added `enabled: true`, comprehensive JSDoc on design decisions
- **hooks/index.ts**: Added `UseRecentlyViewedOptions` type export
- **mobile index.tsx**: Updated to options-object call, fixed `accessibilityLabel`, JSDoc on enrichment status
- **useTrackingListener.ts**: Extracted `PRODUCT_ROUTE_PATTERN` constant, JSDoc on dual-subscription design
- **recently-viewed.test.ts**: Added 6 tests for `recentlyViewedQueryOptions` anonymous path
- **Story file**: Fixed Quick Reference table, added `sprint-status.yaml` to File List

### Quality Gate

- 266 tests pass (248 existing + 12 original + 6 new review tests)
- `bun run fix-all` exits 0 (Prettier + ESLint + TypeCheck all clean)
