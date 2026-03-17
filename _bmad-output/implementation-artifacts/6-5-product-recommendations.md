# Story 6.5: Product Recommendations

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Quick Reference — Files to Create/Update

| Action | File | Notes |
| ------ | ---- | ----- |
| CREATE | `supabase/functions/get-recommendations/index.ts` | Edge Function: pgvector cosine similarity lookup + optional personalization boost |
| CREATE | `packages/shared/src/types/recommendation.types.ts` | `RecommendationItem`, `RecommendationResponse`, function type aliases |
| CREATE | `packages/shared/src/schemas/recommendation.schema.ts` | Zod schemas for Edge Function response validation |
| CREATE | `packages/shared/src/hooks/useRecommendations.ts` | TanStack Query hook with `['recommendations', productId]` query key |
| CREATE | `apps/web/src/components/product/RecommendationRow.tsx` | "You might also like" section — horizontal scroll of product cards |
| CREATE | `apps/web/src/styles/components/recommendation-row.css` | BEM `.recommendation-row` block |
| CREATE | `apps/web/src/__tests__/recommendations.test.ts` | Unit tests for recommendation hook, schemas, query keys |
| UPDATE | `apps/web/src/components/product/ProductDetail.tsx` | Replace placeholder `product-detail__similar` with `RecommendationRow` |
| UPDATE | `apps/web/src/components/product/ProductDetail.css` | Update `.product-detail__similar` styles for async loading |
| UPDATE | `apps/mobile/src/components/product/ProductDetail.tsx` | Add horizontal FlatList recommendations section below product details |
| UPDATE | `packages/shared/src/types/index.ts` | Add recommendation type exports |
| UPDATE | `packages/shared/src/schemas/index.ts` | Add recommendation schema exports |
| UPDATE | `packages/shared/src/hooks/index.ts` | Add recommendation hook exports |
| UPDATE | `packages/shared/src/utils/constants.ts` | Add `recommendations` to `queryKeys` factory |
| UPDATE | `apps/web/src/styles/index.css` | Import `recommendation-row.css` |
| UPDATE | `supabase/functions/_shared/schemas.ts` | Mirror Zod schemas for Deno (recommendation response) |

---

## Story

As a **visitor**,
I want to see product recommendations based on what I'm viewing,
So that I can discover related products I might like.

## Acceptance Criteria

1. **Given** a visitor viewing a product detail page
   **When** the page loads
   **Then** a "You might also like" section shows 4-8 semantically similar products (FR5, FR30)
   **And** similarity is computed via pgvector cosine distance on product embeddings
   **And** recommendations exclude the current product and out-of-stock items
   **And** no manipulative "X people are viewing this" or fake scarcity (anti-dark-patterns)

2. **Given** an authenticated user viewing a product detail page
   **When** recommendations load
   **Then** recommendations also factor in browsing history (FR6) via `get_user_search_profile()` RPC
   **And** personalization is backend-driven — the component doesn't know whether results are personalized
   **And** no "Based on your browsing" indicator (recommendations should feel natural, not surveillance)

3. **Given** the product detail page
   **When** recommendations load
   **Then** recommendations load asynchronously (don't block product page render)
   **And** a skeleton/loading state is shown while loading
   **And** if recommendation fetch fails, the section is silently hidden (graceful degradation)

4. **Given** the web product detail page
   **When** recommendations render
   **Then** desktop: horizontal row of 4-8 product cards below product details
   **And** mobile breakpoint: horizontal scroll with snap points
   **And** each card uses the existing `BaseProductCard` component (with WishlistButton overlay)

5. **Given** the mobile app product detail screen
   **When** recommendations render
   **Then** a horizontal `FlatList` shows recommended products below product details
   **And** cards are tappable and navigate to the product detail screen

6. **Given** a product with no embeddings in the database (e.g., newly added, not yet processed)
   **When** the recommendation Edge Function is called
   **Then** it returns an empty array (not an error)
   **And** the "You might also like" section is hidden (not shown with "No recommendations")

7. **Given** `packages/shared/src/hooks/useRecommendations.ts`
   **When** consumed by web or mobile app
   **Then** it provides:
   - `useRecommendations(productId, supabaseClient)` — query hook with `staleTime: 5 min`
   - Query key: `['recommendations', productId]`
   - `enabled: !!productId`
   - Returns `RecommendationItem[]` (enriched with live Violet data)

8. **Given** the Edge Function `supabase/functions/get-recommendations/index.ts`
   **When** invoked with `{ product_id, user_id? }`
   **Then** it:
   - Looks up the current product's embedding in `product_embeddings`
   - Uses `match_products()` RPC with that embedding to find similar products
   - Excludes the current product from results
   - If `user_id` provided: applies personalization boost (category affinity, price proximity) using `get_user_search_profile()` RPC
   - Fetches live product data from Violet API for the matched product IDs
   - Returns `{ data: RecommendationResponse, error: null }` or `{ data: null, error: string }`

## Tasks / Subtasks

- [x] **Task 1: Edge Function** — `supabase/functions/get-recommendations/index.ts` (AC: #1, #2, #6, #8)
  - [x] 1.1: Create Edge Function with Zod input validation: `{ product_id: string, user_id?: string, limit?: number }`
  - [x] 1.2: Look up current product's embedding via `supabase.from("product_embeddings").select("embedding").eq("product_id", product_id).single()`
  - [x] 1.3: If no embedding found → return `{ data: { products: [], personalized: false }, error: null }` (not an error)
  - [x] 1.4: Call `match_products()` RPC with the product's embedding vector, `match_threshold: 0.3`, `match_count: limit + 1` (extra to account for self-exclusion)
  - [x] 1.5: Filter out the current product from results (by `product_id`)
  - [x] 1.6: If `user_id` provided → call `get_user_search_profile(user_id)` RPC → apply personalization boost (same formula as `search-products`: `0.7 × similarity + 0.2 × category_boost + 0.1 × price_proximity`)
  - [x] 1.7: Re-sort by final score, take top `limit` (default 8)
  - [x] 1.8: Fetch live product data from Violet API for matched product IDs (parallel fetch, same pattern as `search-products`)
  - [x] 1.9: Return `{ data: RecommendationResponse, error: null }` — response matches `recommendationResponseSchema`
  - [x] 1.10: Error handling: if Violet fetch fails for some products → return subset that succeeded (don't fail all)
  - [x] 1.11: CORS headers via `_shared/cors.ts`
  - [x] 1.12: Use `_shared/supabaseAdmin.ts` for service_role client, `_shared/violetAuth.ts` for Violet API calls

- [x] **Task 2: Shared types** — `packages/shared/src/types/recommendation.types.ts` (AC: #7)
  - [x] 2.1: Create `RecommendationItem` interface extending `ProductMatch` from search types (reuse `id`, `name`, `description`, `minPrice`, `maxPrice`, `currency`, `available`, `vendor`, `source`, `externalUrl`, `thumbnailUrl`, `similarity`)
  - [x] 2.2: Create `RecommendationResponse` interface: `{ products: RecommendationItem[], personalized: boolean }`
  - [x] 2.3: Create `RecommendationFetchFn` type alias: `(productId: string) => Promise<RecommendationResponse>`
  - [x] 2.4: Export from `packages/shared/src/types/index.ts`

- [x] **Task 3: Zod schemas** — `packages/shared/src/schemas/recommendation.schema.ts` (AC: #7)
  - [x] 3.1: Create `recommendationItemSchema` — reuse `productMatchSchema` fields from `search.schema.ts`
  - [x] 3.2: Create `recommendationResponseSchema`: `{ products: z.array(recommendationItemSchema), personalized: z.boolean() }`
  - [x] 3.3: Export from `packages/shared/src/schemas/index.ts`
  - [x] 3.4: Mirror schemas in `supabase/functions/_shared/schemas.ts` with sync documentation comment

- [x] **Task 4: TanStack Query hook** — `packages/shared/src/hooks/useRecommendations.ts` (AC: #7)
  - [x] 4.1: Add to `queryKeys` in `packages/shared/src/utils/constants.ts`:
    ```typescript
    recommendations: {
      forProduct: (productId: string) => ["recommendations", productId] as const,
    },
    ```
  - [x] 4.2: Create `recommendationQueryOptions(productId, supabaseClient)`:
    - `queryKey: queryKeys.recommendations.forProduct(productId)`
    - `queryFn`: calls `supabaseClient.functions.invoke("get-recommendations", { body: { product_id: productId, user_id } })`
    - Validate response with `recommendationResponseSchema`
    - `staleTime: 5 * 60 * 1000` (5 min)
    - `enabled: !!productId`
  - [x] 4.3: Create `useRecommendations(productId, supabaseClient)` convenience hook
  - [x] 4.4: Hook should extract `user_id` from auth context and pass to Edge Function (for personalization)
  - [x] 4.5: Export from `packages/shared/src/hooks/index.ts`
  - [x] 4.6: **Pattern**: Follow `useSearch` pattern — calls `supabase.functions.invoke()` directly, validates with Zod

- [x] **Task 5: Web RecommendationRow component** — `apps/web/src/components/product/RecommendationRow.tsx` (AC: #1, #3, #4, #6)
  - [x] 5.1: Create component accepting `productId: string` prop
  - [x] 5.2: Uses `useRecommendations(productId, supabaseClient)` hook
  - [x] 5.3: Loading state: skeleton row (4 placeholder cards)
  - [x] 5.4: Empty/error state: return `null` (section hidden entirely — no "No recommendations" text)
  - [x] 5.5: Success: render "You might also like" heading + horizontal row of `BaseProductCard` components
  - [x] 5.6: Desktop: CSS grid/flexbox row, up to 4 visible cards (overflow hidden)
  - [x] 5.7: Mobile breakpoint: `overflow-x: auto`, `scroll-snap-type: x mandatory`, `scroll-snap-align: start` on cards
  - [x] 5.8: **CRITICAL**: Use existing `BaseProductCard` — do NOT create a new card component. WishlistButton is already integrated.

- [x] **Task 6: RecommendationRow CSS** — `apps/web/src/styles/components/recommendation-row.css` (AC: #4)
  - [x] 6.1: BEM block `.recommendation-row`:
    - `.recommendation-row` — full width, border-top, padding-top
    - `.recommendation-row__heading` — Cormorant display font, `font-size: 1.25rem`
    - `.recommendation-row__grid` — `display: flex`, `gap: var(--space-4)`, `overflow-x: auto`, `-webkit-overflow-scrolling: touch`
    - `.recommendation-row__grid::-webkit-scrollbar` — hide scrollbar (clean look)
    - `.recommendation-row__card` — `min-width: 220px`, `flex-shrink: 0`, `scroll-snap-align: start`
    - `.recommendation-row__skeleton` — loading placeholder with pulse animation
  - [x] 6.2: Desktop media query: `.recommendation-row__grid` shows 4 cards without scroll
  - [x] 6.3: Add import to `apps/web/src/styles/index.css`

- [x] **Task 7: Update web ProductDetail** — `apps/web/src/components/product/ProductDetail.tsx` (AC: #1, #3)
  - [x] 7.1: Replace the placeholder `<div className="product-detail__similar">` block with `<RecommendationRow productId={product.id} />`
  - [x] 7.2: Remove the `<h3>Similar Products</h3><p>Recommendations coming soon</p>` placeholder
  - [x] 7.3: Remove `.product-detail__similar p` placeholder CSS (keep `.product-detail__similar` container for grid spanning)
  - [x] 7.4: **CRITICAL**: RecommendationRow must be lazy — it fetches its own data via `useRecommendations`. Do NOT add recommendation data to the product detail loader.

- [x] **Task 8: Update mobile ProductDetail** — `apps/mobile/src/components/product/ProductDetail.tsx` (AC: #5)
  - [x] 8.1: Add "You might also like" section below product description
  - [x] 8.2: Use horizontal `FlatList` with `recommendationQueryOptions` data
  - [x] 8.3: Each item: product image, name, price — tappable to navigate to product detail
  - [x] 8.4: Loading: `ActivityIndicator` or skeleton
  - [x] 8.5: Empty/error: return `null` (hide section)
  - [x] 8.6: Use `ThemedText` / `ThemedView` following mobile patterns

- [x] **Task 9: Tests** — `apps/web/src/__tests__/recommendations.test.ts` (AC: all)
  - [x] 9.1: Test `queryKeys.recommendations.forProduct()` returns correct key structure
  - [x] 9.2: Test `recommendationItemSchema` validates correct data
  - [x] 9.3: Test `recommendationItemSchema` rejects invalid data (missing fields)
  - [x] 9.4: Test `recommendationResponseSchema` validates full response
  - [x] 9.5: Test empty products array is valid (for no-embedding case)
  - [x] 9.6: Follow Story 6.4 pattern: test pure functions/schemas, not hooks directly

- [x] **Task 10: Barrel exports & quality checks** (AC: all)
  - [x] 10.1: Update `packages/shared/src/types/index.ts` — add recommendation types
  - [x] 10.2: Update `packages/shared/src/schemas/index.ts` — add recommendation schemas
  - [x] 10.3: Update `packages/shared/src/hooks/index.ts` — add recommendation hook/queryOptions
  - [x] 10.4: Update `packages/shared/src/utils/constants.ts` — add `recommendations` to `queryKeys`
  - [x] 10.5: Run `bun run fix-all` — 0 errors, 0 warnings
  - [x] 10.6: Run `bun --cwd=apps/web run test` — all tests pass
  - [x] 10.7: Run `bun run typecheck` — no TypeScript errors

---

## Dev Notes

### Critical Architecture Constraints

- **Recommendations are for ALL visitors** — Unlike wishlist (auth-only), recommendations work for anonymous visitors too. Personalization boost is applied only when `user_id` is available, but the base similarity results are universal.

- **Use an Edge Function, NOT a Server Function** — Architecture rule: "If both web and mobile need it → Edge Function." Recommendations are needed on both platforms, so `supabase/functions/get-recommendations/index.ts` is the correct location. Follow the `search-products` Edge Function pattern.

- **pgvector cosine similarity is already set up** — The `match_products()` RPC function in `product_embeddings` does the heavy lifting. It takes a `query_embedding vector(1536)`, `match_threshold float` (default 0.3), and `match_count int` (default 12). It returns `product_id`, `product_name`, `text_content`, `similarity`. It already filters out unavailable products (`available = true`).

- **The "query" for recommendations is the PRODUCT's own embedding** — Unlike search (which generates an embedding from user text), recommendations use the viewed product's existing embedding as the query vector. Steps: (1) look up product embedding → (2) pass it to `match_products()` → (3) get similar products.

- **Personalization boost is optional** — Same formula as `search-products`: `final = 0.7 × similarity + 0.2 × category_boost + 0.1 × price_proximity`. Uses `get_user_search_profile()` RPC (from Story 6.3 migration `20260326000000_search_personalization.sql`). If no user_id → skip personalization, use raw similarity.

- **Async loading — don't block product page** — Recommendations must NOT be in the product detail route loader. They should lazy-load client-side via `useRecommendations()`. Show skeleton while loading, hide section on error/empty.

- **Use BaseProductCard — do NOT create a new card** — The existing `BaseProductCard.tsx` already has WishlistButton overlay (Story 6.4), image, price, merchant name. Reuse it in the recommendation row.

- **No dark patterns** — UX spec explicitly forbids: "X people are viewing this", fake scarcity, manipulative cross-sell, "Customers also bought" between cart and checkout. Recommendations are ONLY on product pages, presented subtly as "You might also like".

- **Graceful degradation** — If the Edge Function fails, the product page works perfectly without recommendations. If a product has no embedding, return empty array. If Violet fetch fails for some products, return the subset that succeeded.

- **No Tailwind CSS** — All styling is Vanilla CSS + BEM.

- **Schema mirroring** — Zod schemas must exist in BOTH `packages/shared/src/schemas/` (Node) AND `supabase/functions/_shared/schemas.ts` (Deno). These files cannot share code — Deno Edge Functions can't import Node workspace packages.

### Existing Utilities to Reuse (DO NOT REBUILD)

| Utility | Location | What it provides |
| ------- | -------- | ---------------- |
| `match_products()` RPC | `supabase/migrations/20260313100001_*.sql` | pgvector cosine similarity search with availability filter |
| `get_user_search_profile()` RPC | `supabase/migrations/20260326000000_*.sql` | User's top categories, avg price, recent products |
| `_shared/supabaseAdmin.ts` | `supabase/functions/_shared/` | Service role Supabase client |
| `_shared/violetAuth.ts` | `supabase/functions/_shared/` | Violet API authenticated requests |
| `_shared/cors.ts` | `supabase/functions/_shared/` | CORS headers for Edge Functions |
| `_shared/schemas.ts` | `supabase/functions/_shared/` | Deno-side Zod schemas (must mirror Node schemas) |
| `BaseProductCard` | `apps/web/src/components/product/BaseProductCard.tsx` | Product card with WishlistButton — reuse for recommendation items |
| `useUser()` / `useAuth()` | `packages/shared/src/hooks/useAuth.ts` | Get current user for personalization |
| `createSupabaseClient()` | `packages/shared/src/clients/supabase.ts` | Browser Supabase client for Edge Function invocation |
| `queryKeys` | `packages/shared/src/utils/constants.ts` | TanStack Query key factory — add `recommendations` entry |
| `productMatchSchema` | `packages/shared/src/schemas/search.schema.ts` | Reuse fields for `recommendationItemSchema` |
| `ProductMatch` type | `packages/shared/src/types/search.types.ts` | Reuse interface for `RecommendationItem` |
| `formatPrice()` | `packages/shared/src/utils/format.ts` | Price formatting (product cards already use this) |

### Existing Code Patterns to Follow

```typescript
// Edge Function pattern (from search-products/index.ts):
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { product_id, user_id, limit = 8 } = await req.json();
    // ... validation, logic, Violet fetch ...
    return new Response(JSON.stringify({ data: response, error: null }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ data: null, error: error.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
```

```typescript
// Hook pattern (from useSearch.ts):
export function recommendationQueryOptions(
  productId: string,
  supabaseClient: SupabaseClient,
) {
  return queryOptions({
    queryKey: queryKeys.recommendations.forProduct(productId),
    queryFn: async () => {
      const { data, error } = await supabaseClient.functions.invoke(
        "get-recommendations",
        { body: { product_id: productId } },
      );
      if (error) throw error;
      return recommendationResponseSchema.parse(data.data);
    },
    staleTime: 5 * 60 * 1000, // 5 min
    enabled: !!productId,
  });
}
```

```typescript
// Query key factory extension (add to constants.ts):
recommendations: {
  forProduct: (productId: string) => ["recommendations", productId] as const,
},
```

```css
/* Horizontal scroll pattern (BEM): */
.recommendation-row {
  border-top: 1px solid var(--border-subtle);
  padding-top: var(--space-6);
}

.recommendation-row__heading {
  font-family: var(--font-display);
  font-size: 1.25rem;
  font-weight: 500;
  margin: 0 0 var(--space-4);
  color: var(--color-ink);
}

.recommendation-row__grid {
  display: flex;
  gap: var(--space-4);
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  scroll-snap-type: x mandatory;
  scrollbar-width: none; /* Firefox */
}

.recommendation-row__grid::-webkit-scrollbar {
  display: none; /* Chrome/Safari */
}

.recommendation-row__card {
  min-width: 220px;
  flex-shrink: 0;
  scroll-snap-align: start;
}

@media (min-width: 1024px) {
  .recommendation-row__grid {
    overflow: hidden;
    scroll-snap-type: none;
  }

  .recommendation-row__card {
    flex: 1;
    min-width: 0;
    max-width: 25%; /* 4 cards */
  }
}
```

### Database Schema Reference

```sql
-- EXISTING TABLE USED BY THIS STORY (NOT modified):

-- product_embeddings (Story 3.5 + Story 3.7):
-- Contains product text + OpenAI embeddings for semantic search
CREATE TABLE public.product_embeddings (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id   VARCHAR     NOT NULL UNIQUE,
  product_name TEXT        NOT NULL,
  text_content TEXT        NOT NULL,
  embedding    vector(1536),
  available    BOOLEAN     NOT NULL DEFAULT true,   -- Story 3.7
  source       VARCHAR     DEFAULT 'violet',         -- Story 3.7
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- EXISTING RPC FUNCTION USED BY THIS STORY:
-- match_products(query_embedding, match_threshold, match_count)
-- Returns: product_id, product_name, text_content, similarity
-- Already filters available = true

-- EXISTING RPC FUNCTION USED FOR PERSONALIZATION:
-- get_user_search_profile(p_user_id UUID) → JSONB
-- Returns: { top_categories, avg_order_price, recent_product_ids, total_events }

-- NO NEW TABLES OR MIGRATIONS NEEDED FOR THIS STORY
```

### Previous Story Intelligence (Story 6.4)

- **Implementation sequence**: migration → types → schemas → client functions → hooks → web UI → mobile UI → exports → tests → fix-all. For this story: Edge Function → types → schemas → hooks → web UI → mobile UI → exports → tests → fix-all.
- **Deep imports don't work**: `@ecommerce/shared/hooks/useRecommendations` fails — must use barrel exports via `@ecommerce/shared`. Always update barrel files.
- **Server-only imports leaking**: Ensure no server-only modules leak into client-side hook code.
- **Pre-existing test failures**: `orderStatusDerivation` and `violetCartAdapter` — not introduced by this story, ignore them.
- **`renderHook` issues in monorepo**: Test pure functions and Zod schemas, not hooks directly.
- **Barrel exports**: ALWAYS update `types/index.ts`, `schemas/index.ts`, `hooks/index.ts` when adding new modules.
- **WishlistButton crashes in test**: Already wrapped in ErrorBoundary — no action needed here, but be aware when writing tests that render `BaseProductCard`.
- **Toast system exists**: Created in Story 6.4 (`apps/web/src/components/ui/Toast.tsx`) — available if needed but recommendations likely don't need toast notifications.
- **Mobile uses placeholder data**: Mobile wishlist used placeholder product names because fetching live Violet data per item requires Edge Function. For recommendations, the Edge Function already returns enriched data — mobile can use it directly.

### Git Intelligence

- Commit pattern: `feat: implement <description> (Story X.Y) + code review fixes`
- Recent commits: Stories 6.1-6.4 built personalization pipeline (profiles, tracking, search, wishlist). This story leverages the pgvector + personalization infrastructure built in Stories 3.5 and 6.3.
- Edge Functions follow Deno patterns (jsr imports, `Deno.serve`). Cannot import from Node workspace packages.
- The `search-products` Edge Function is the closest architectural reference for `get-recommendations`.

### Project Structure Notes

- **New Edge Function**: `supabase/functions/get-recommendations/index.ts` — follows same pattern as `search-products/`
- **New shared types/schemas**: `packages/shared/src/types/recommendation.types.ts`, `packages/shared/src/schemas/recommendation.schema.ts`
- **New shared hook**: `packages/shared/src/hooks/useRecommendations.ts` — TanStack Query hook
- **New web component**: `apps/web/src/components/product/RecommendationRow.tsx` — horizontal product card row
- **New web CSS**: `apps/web/src/styles/components/recommendation-row.css`
- **Modified**: `ProductDetail.tsx` (web — replace placeholder), `ProductDetail.tsx` (mobile — add section), `constants.ts` (query keys), barrel exports
- **Downstream dependencies**: Story 6.6 (Recently Viewed) may reuse the recommendation pattern. The recommendation Edge Function could later be used for homepage "For You" recommendations.

### References

- [Source: epics.md#Story 6.5 — Product Recommendations acceptance criteria]
- [Source: epics.md#FR5 — System suggests similar products based on semantic similarity]
- [Source: epics.md#FR6 — Returning users receive results weighted by browsing/purchase history]
- [Source: architecture.md#Data Architecture — pgvector embeddings in Supabase for semantic search]
- [Source: architecture.md#API Patterns — Edge Functions for cross-platform operations]
- [Source: architecture.md#Edge Function Names — kebab-case folders: get-recommendations/]
- [Source: architecture.md#TanStack Query staleTime — catalog: 5 min, search: 2 min]
- [Source: architecture.md#Data Boundaries — product_embeddings read by search, written by generate-embeddings]
- [Source: ux-design-specification.md#Smart Recommendations — "You might also like", quality over quantity, never as filler]
- [Source: ux-design-specification.md#Anti-Patterns — No "Customers also bought" cross-sell between cart and checkout]
- [Source: ux-design-specification.md#AI recommendation row — P1 component priority]
- [Source: ux-design-specification.md#Graceful degradation — If product OOS, similar products suggested]
- [Source: ux-design-specification.md#Recommendation entry point — Homepage or post-purchase, max 6 items, high relevance]
- [Source: prd.md#FR5 — Suggest similar products based on semantic similarity]
- [Source: 6-4-wishlist-saved-items.md — implementation sequence, barrel export pattern, test strategy, WishlistButton ErrorBoundary]
- [Source: CLAUDE.md — No Tailwind CSS, double quotes, semicolons, 100 char width, conventional commit format]

## Dev Agent Record

### Agent Model Used

claude-opus-4-6

### Debug Log References

- RecommendationRow crashed ProductDetail tests because `useUser()` requires QueryClientProvider. Fixed with ErrorBoundary pattern (same as WishlistButton in Story 6.4) — `RecommendationBoundary` renders null on error.
- Existing ProductDetail test expected "Similar Products" placeholder text — updated test to verify `.product-detail__similar` container exists instead.
- Edge Function initially imported `createClient` from `jsr:@supabase/supabase-js@2` unused — removed to clean up lint.
- Mobile import: `createSupabaseClient` comes from `@ecommerce/shared` barrel export (not deep import). Web uses `getSupabaseBrowserClient` from `apps/web/src/utils/supabase.ts`.
- `RecommendationItem` is a type alias for `ProductMatch` (not a new interface) since both represent the same shape: pgvector match + Violet enrichment.

### Completion Notes List

- Created `supabase/functions/get-recommendations/index.ts` — Edge Function: looks up product embedding, calls `match_products()` RPC for cosine similarity, excludes self, optionally applies personalization boost (same formula as search-products: 0.7×similarity + 0.2×category + 0.1×price), fetches live Violet data, returns `{ data: RecommendationResponse, error }` envelope.
- Created `packages/shared/src/types/recommendation.types.ts` — `RecommendationItem` (= `ProductMatch`), `RecommendationResponse`, `RecommendationFetchFn`.
- Created `packages/shared/src/schemas/recommendation.schema.ts` — `recommendationItemSchema` (reuses `productMatchSchema`), `recommendationResponseSchema`.
- Created `packages/shared/src/hooks/useRecommendations.ts` — `recommendationQueryOptions()` and `useRecommendations()` hook. Calls Edge Function via `supabase.functions.invoke()`, validates with Zod, staleTime 5 min.
- Created `apps/web/src/components/product/RecommendationRow.tsx` — "You might also like" section with ErrorBoundary wrapper. Uses `BaseProductCard` (WishlistButton included). Skeleton loading state, null on error/empty.
- Created `apps/web/src/styles/components/recommendation-row.css` — BEM `.recommendation-row` with horizontal scroll, snap points, hidden scrollbar. Desktop: 4-card grid. Mobile: scroll with snap.
- Updated `apps/web/src/components/product/ProductDetail.tsx` — Replaced "Similar Products" placeholder with `<RecommendationRow productId={product.id} />`.
- Updated `apps/web/src/components/product/ProductDetail.css` — Removed placeholder h3/p styles, kept container for grid spanning.
- Updated `apps/mobile/src/components/product/ProductDetail.tsx` — Added `RecommendationsSection` component with horizontal FlatList, ActivityIndicator loading, tappable cards navigating to product detail.
- Updated `packages/shared/src/utils/constants.ts` — Added `recommendations.forProduct()` to `queryKeys`.
- Updated barrel exports: `types/index.ts`, `schemas/index.ts`, `hooks/index.ts`.
- Updated `supabase/functions/_shared/schemas.ts` — Added `recommendationRequestSchema` with sync documentation.
- Updated `apps/web/src/styles/index.css` — Added `recommendation-row.css` import.
- Created `apps/web/src/__tests__/recommendations.test.ts` — 13 tests: query keys (3), item schema validation (5), response schema validation (5).
- Updated `apps/web/src/components/product/__tests__/ProductDetail.test.tsx` — Updated placeholder test to verify container div exists instead of text content.
- All 248 web tests pass (235 existing + 13 new). `bun run fix-all` exits 0 (Prettier + ESLint + TypeCheck all clean).

### File List

- `supabase/functions/get-recommendations/index.ts` (CREATE)
- `packages/shared/src/types/recommendation.types.ts` (CREATE)
- `packages/shared/src/schemas/recommendation.schema.ts` (CREATE)
- `packages/shared/src/hooks/useRecommendations.ts` (CREATE)
- `apps/web/src/components/product/RecommendationRow.tsx` (CREATE)
- `apps/web/src/styles/components/recommendation-row.css` (CREATE)
- `apps/web/src/__tests__/recommendations.test.ts` (CREATE)
- `packages/shared/src/types/index.ts` (UPDATE — added recommendation type exports)
- `packages/shared/src/schemas/index.ts` (UPDATE — added recommendation schema exports)
- `packages/shared/src/hooks/index.ts` (UPDATE — added recommendation hook exports)
- `packages/shared/src/utils/constants.ts` (UPDATE — added recommendations to queryKeys)
- `supabase/functions/_shared/schemas.ts` (UPDATE — added recommendationRequestSchema)
- `apps/web/src/styles/index.css` (UPDATE — added recommendation-row.css import)
- `apps/web/src/components/product/ProductDetail.tsx` (UPDATE — replaced placeholder with RecommendationRow)
- `apps/web/src/components/product/ProductDetail.css` (UPDATE — removed placeholder styles)
- `apps/mobile/src/components/product/ProductDetail.tsx` (UPDATE — added RecommendationsSection with FlatList)
- `apps/web/src/components/product/__tests__/ProductDetail.test.tsx` (UPDATE — updated placeholder test)
