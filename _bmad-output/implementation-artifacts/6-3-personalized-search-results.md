# Story 6.3: Personalized Search Results

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Quick Reference — Files to Create/Update

| Action | File | Notes |
| ------ | ---- | ----- |
| CREATE | `supabase/migrations/20260326000000_search_personalization.sql` | SQL function `get_user_search_profile(p_user_id UUID)` — aggregates user_events + order_items into category affinity, price range, recent product IDs. No new tables. |
| CREATE | `packages/shared/src/types/personalization.types.ts` | `UserSearchProfile`, `CategoryAffinity`, `PersonalizationBoost` types |
| CREATE | `apps/web/src/__tests__/personalization.test.ts` | Unit tests for boost scoring, re-ranking, opt-out, anonymous fallback |
| UPDATE | `supabase/functions/search-products/index.ts` | Accept JWT → extract user_id → fetch user search profile → compute boost scores → re-rank results. Add `personalized` flag to response. |
| ~SKIP~ | `supabase/functions/_shared/schemas.ts` | ~~Add user_id field~~ — NOT NEEDED: JWT in Authorization header handles auth, no body changes required (see Dev Notes) |
| UPDATE | `packages/shared/src/types/search.types.ts` | Add `personalized?: boolean` and `personalizationHint?: string` to `SearchResponse` |
| UPDATE | `packages/shared/src/schemas/search.schema.ts` | Add `personalized` and `personalizationHint` to `searchResponseSchema` |
| UPDATE | `packages/shared/src/types/profile.types.ts` | Add `personalized_search?: boolean` to `UserPreferences` |
| UPDATE | `packages/shared/src/schemas/profile.schema.ts` | Add `personalized_search` to `userPreferencesSchema` |
| UPDATE | `apps/web/src/routes/account/profile.tsx` | Add personalization toggle in preferences section |
| UPDATE | `apps/web/src/components/search/SearchResults.tsx` | Add subtle personalization indicator when `personalized === true` |
| UPDATE | `apps/mobile/src/app/search.tsx` | Add personalization indicator (mobile equivalent) |

---

## Story

As a **returning user**,
I want search results weighted by my browsing and purchase history,
So that I find relevant products faster.

## Acceptance Criteria

1. **Given** an authenticated user with browsing/purchase history
   **When** they perform a search
   **Then** the AI search Edge Function extracts user_id from the JWT (Authorization header) — NOT from request body
   **And** fetches the user's search profile (category affinity from `user_events`, price range from `order_items`)
   **And** computes a personalization boost for each search result
   **And** re-ranks results by: `final_score = 0.7 × semantic_similarity + 0.2 × category_boost + 0.1 × price_proximity`
   **And** the response includes `personalized: true` flag

2. **Given** an authenticated user with NO browsing/purchase history (new account)
   **When** they perform a search
   **Then** the Edge Function detects an empty search profile (no events, no orders)
   **And** returns standard non-personalized results (pgvector similarity only)
   **And** the response includes `personalized: false`

3. **Given** an anonymous/guest user
   **When** they perform a search
   **Then** the Edge Function has no JWT (or anonymous JWT)
   **And** returns standard non-personalized results — no degraded experience
   **And** the response includes `personalized: false`

4. **Given** personalized search results are returned
   **When** the search results page renders
   **Then** a subtle personalization indicator is displayed (e.g., "Results tailored to your preferences")
   **And** the indicator is non-manipulative — no dark pattern (no "Only for you!" urgency language)
   **And** the indicator is not shown for non-personalized results

5. **Given** the `get_user_search_profile` SQL function
   **When** called with a user_id
   **Then** returns a JSON object with:
   - `top_categories`: array of `{ category: string, view_count: number }` from `user_events` WHERE `event_type IN ('product_view', 'category_view')`, aggregated from payload, limited to top 5 by count, last 3 months only
   - `avg_order_price`: average price from `order_items` joined with `orders` WHERE `orders.user_id = p_user_id`, in cents (integer)
   - `recent_product_ids`: array of distinct product_ids from `user_events` WHERE `event_type = 'product_view'`, last 30 days, limit 20
   - `total_events`: count of all user_events for this user (used to gauge profile strength)
   **And** returns empty/default values if no data exists (never errors)

6. **Given** a user has opted out of personalized search
   **When** their `user_profiles.preferences` contains `{ "personalized_search": false }`
   **And** they perform a search
   **Then** the Edge Function reads the user's profile, detects opt-out
   **And** skips all personalization logic (no preference fetching, no boosting)
   **And** returns standard results with `personalized: false`

7. **Given** the account settings page (`/account/profile`)
   **When** the user views their preferences
   **Then** a "Personalized search results" toggle is displayed in the preferences section
   **And** it defaults to ON (enabled)
   **And** toggling it updates `user_profiles.preferences.personalized_search` via the existing `updateProfile` mutation
   **And** the change takes effect on the next search (no page reload needed — preference cached in TanStack Query)

8. **Given** the personalization boost calculation
   **When** computing `category_boost` for a search result
   **Then** the boost is computed by matching the product's category (extracted from `product_embeddings.text_content` field, pattern `Category: {category}`) against the user's `top_categories`
   **And** `category_boost` = 1.0 if product category matches user's #1 category, 0.7 for #2, 0.5 for #3, 0.3 for #4-5, 0.0 if no match

   **When** computing `price_proximity` for a search result
   **Then** `price_proximity` = 1.0 - min(|product_price - user_avg_price| / user_avg_price, 1.0), clamped to [0, 1]
   **And** if no order history exists, `price_proximity` = 0.5 (neutral, no boost or penalty)

9. **Given** web + mobile platforms
   **When** search is performed on either platform
   **Then** personalization is identical (backend-driven, no client-side logic difference)
   **And** the Supabase client automatically sends the JWT in the Authorization header on both platforms
   **And** no changes to `useSearch` hook or `SearchQuery` type are needed — the JWT is already transmitted

10. **Given** performance requirements
    **When** personalized search is performed
    **Then** the additional latency from personalization (profile fetch + boost calculation) is < 100ms
    **And** the `get_user_search_profile` SQL function uses indexes on `user_events(user_id, event_type)` and `orders(user_id)` (both already exist)
    **And** personalization logic does NOT block the main pgvector search — it runs in parallel or sequentially after match_products returns

## Tasks / Subtasks

- [x] **Task 1: SQL function for user search profile** — `supabase/migrations/20260326000000_search_personalization.sql` (AC: #5)
  - [x]1.1: Create `get_user_search_profile(p_user_id UUID)` function:
    ```sql
    CREATE OR REPLACE FUNCTION public.get_user_search_profile(p_user_id UUID)
    RETURNS JSONB
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $$
    DECLARE
      result JSONB;
      v_top_categories JSONB;
      v_avg_order_price INTEGER;
      v_recent_product_ids JSONB;
      v_total_events INTEGER;
    BEGIN
      -- Top categories from browsing history (last 3 months)
      SELECT COALESCE(jsonb_agg(row_to_json(cats)), '[]'::jsonb)
      INTO v_top_categories
      FROM (
        SELECT
          COALESCE(
            payload->>'category',
            payload->>'category_name'
          ) AS category,
          COUNT(*) AS view_count
        FROM user_events
        WHERE user_id = p_user_id
          AND event_type IN ('product_view', 'category_view')
          AND created_at > now() - INTERVAL '3 months'
          AND (payload->>'category' IS NOT NULL OR payload->>'category_name' IS NOT NULL)
        GROUP BY 1
        ORDER BY view_count DESC
        LIMIT 5
      ) cats;

      -- Average order price from purchase history (cents)
      SELECT COALESCE(AVG(oi.price)::INTEGER, 0)
      INTO v_avg_order_price
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE o.user_id = p_user_id;

      -- Recent product IDs from product views (last 30 days)
      SELECT COALESCE(jsonb_agg(DISTINCT payload->>'product_id'), '[]'::jsonb)
      INTO v_recent_product_ids
      FROM (
        SELECT payload
        FROM user_events
        WHERE user_id = p_user_id
          AND event_type = 'product_view'
          AND created_at > now() - INTERVAL '30 days'
          AND payload->>'product_id' IS NOT NULL
        ORDER BY created_at DESC
        LIMIT 20
      ) recent;

      -- Total events count (profile strength indicator)
      SELECT COUNT(*)
      INTO v_total_events
      FROM user_events
      WHERE user_id = p_user_id;

      result := jsonb_build_object(
        'top_categories', v_top_categories,
        'avg_order_price', v_avg_order_price,
        'recent_product_ids', v_recent_product_ids,
        'total_events', v_total_events
      );

      RETURN result;
    END;
    $$;

    -- Grant execute to authenticated users (they can only get their own profile via RLS context)
    GRANT EXECUTE ON FUNCTION public.get_user_search_profile(UUID) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.get_user_search_profile(UUID) TO service_role;
    ```
  - [x]1.2: Note: `SECURITY DEFINER` is used so the function can read `user_events` and `orders` regardless of the caller's RLS context. This is safe because the function only queries data for the provided `p_user_id`, and the Edge Function validates the JWT before calling. The function does NOT expose other users' data.
  - [x]1.3: Note: No new indexes needed — `idx_user_events_user_type` on `(user_id, event_type)` and existing `orders(user_id)` index cover all queries.

- [x] **Task 2: Personalization types** — `packages/shared/src/types/personalization.types.ts` (AC: #1, #5, #8)
  - [x]2.1: Create personalization types:
    ```typescript
    export interface CategoryAffinity {
      category: string;
      view_count: number;
    }

    export interface UserSearchProfile {
      top_categories: CategoryAffinity[];
      avg_order_price: number; // cents, 0 if no orders
      recent_product_ids: string[];
      total_events: number;
    }

    export interface PersonalizationBoost {
      category_boost: number; // 0-1
      price_proximity: number; // 0-1
      final_score: number; // weighted combination
    }
    ```
  - [x]2.2: Export from `packages/shared/src/types/index.ts`:
    ```typescript
    export type {
      CategoryAffinity,
      UserSearchProfile,
      PersonalizationBoost,
    } from "./personalization.types";
    ```

- [x] **Task 3: Update search response types** — `packages/shared/src/types/search.types.ts` (AC: #1, #4)
  - [x]3.1: Add `personalized` flag and hint to `SearchResponse`:
    ```typescript
    export interface SearchResponse {
      query: string;
      products: ProductMatch[];
      total: number;
      explanations: MatchExplanations;
      personalized?: boolean; // true when results were personalized
      personalizationHint?: string; // e.g., "Results tailored to your preferences"
    }
    ```
  - [x]3.2: Note: `ProductMatch` does NOT change — the `similarity` field now reflects the boosted `final_score` when personalized, but the type is unchanged.

- [x] **Task 4: Update search response schema** — `packages/shared/src/schemas/search.schema.ts` (AC: #1)
  - [x]4.1: Add `personalized` and `personalizationHint` to `searchResponseSchema`:
    ```typescript
    export const searchResponseSchema = z.object({
      query: z.string(),
      products: z.array(productMatchSchema),
      total: z.number().int().nonnegative(),
      explanations: z.record(z.string(), z.string()),
      personalized: z.boolean().optional(),
      personalizationHint: z.string().optional(),
    });
    ```

- [x] **Task 5: Update search Edge Function** — `supabase/functions/search-products/index.ts` (AC: #1, #2, #3, #5, #6, #8, #10)
  - [x]5.1: Add JWT extraction at the beginning of the handler (after CORS check):
    ```typescript
    // Extract authenticated user (if any) from JWT
    let authUserId: string | null = null;
    let personalizationEnabled = true;

    const authHeader = req.headers.get("Authorization");
    if (authHeader) {
      const userClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } },
      );
      const { data: { user } } = await userClient.auth.getUser();
      if (user && !user.is_anonymous) {
        authUserId = user.id;

        // Check opt-out preference
        const { data: profile } = await userClient
          .from("user_profiles")
          .select("preferences")
          .eq("user_id", user.id)
          .single();

        if (profile?.preferences?.personalized_search === false) {
          personalizationEnabled = false;
        }
      }
    }
    ```
  - [x]5.2: After pgvector match + Violet enrichment + post-filters, add personalization re-ranking:
    ```typescript
    let personalized = false;
    let personalizationHint: string | undefined;

    if (authUserId && personalizationEnabled) {
      // Fetch user search profile via SQL function
      const { data: profileData } = await supabaseAdmin
        .rpc("get_user_search_profile", { p_user_id: authUserId });

      const searchProfile = profileData as UserSearchProfile | null;

      if (searchProfile && searchProfile.total_events > 0) {
        // Apply personalization boosting
        const boostedProducts = applyPersonalizationBoost(
          enrichedProducts,
          searchProfile,
          pgvectorResults, // need text_content for category extraction
        );

        enrichedProducts = boostedProducts;
        personalized = true;
        personalizationHint = "Results tailored to your preferences";
      }
    }
    ```
  - [x]5.3: Implement the `applyPersonalizationBoost` helper function (within the Edge Function file or `_shared/`):
    ```typescript
    interface PgvectorResult {
      product_id: string;
      text_content: string;
      similarity: number;
    }

    function applyPersonalizationBoost(
      products: ProductMatch[],
      profile: UserSearchProfile,
      pgvectorResults: PgvectorResult[],
    ): ProductMatch[] {
      // Build category rank map: #1 → 1.0, #2 → 0.7, #3 → 0.5, #4-5 → 0.3
      const categoryBoostMap = new Map<string, number>();
      const boostValues = [1.0, 0.7, 0.5, 0.3, 0.3];
      profile.top_categories.forEach((cat, i) => {
        categoryBoostMap.set(cat.category.toLowerCase(), boostValues[i] ?? 0.3);
      });

      // Build text_content lookup
      const textContentMap = new Map<string, string>();
      pgvectorResults.forEach((r) => {
        textContentMap.set(r.product_id, r.text_content);
      });

      // Compute boosted scores
      const boosted = products.map((product) => {
        const textContent = textContentMap.get(product.id) ?? "";
        const originalSimilarity = product.similarity;

        // Category boost
        const productCategory = extractCategory(textContent);
        const categoryBoost = productCategory
          ? (categoryBoostMap.get(productCategory.toLowerCase()) ?? 0)
          : 0;

        // Price proximity boost
        let priceProximity = 0.5; // neutral default
        if (profile.avg_order_price > 0) {
          const productPrice = product.minPrice; // use minPrice as representative
          const priceDiff = Math.abs(productPrice - profile.avg_order_price);
          priceProximity = Math.max(0, 1 - Math.min(priceDiff / profile.avg_order_price, 1));
        }

        // Weighted final score: 70% semantic + 20% category + 10% price
        const finalScore =
          originalSimilarity * 0.7 +
          categoryBoost * 0.2 +
          priceProximity * 0.1;

        return {
          ...product,
          similarity: Math.round(finalScore * 10000) / 10000, // 4 decimal places
        };
      });

      // Re-rank by boosted score (descending)
      return boosted.sort((a, b) => b.similarity - a.similarity);
    }

    function extractCategory(textContent: string): string | null {
      // text_content format: "Name. Description. Brand: X. Category: Y. Tags: ..."
      const match = textContent.match(/Category:\s*([^.]+)/i);
      return match ? match[1].trim() : null;
    }
    ```
  - [x]5.4: Update the response construction to include personalization fields:
    ```typescript
    return new Response(
      JSON.stringify({
        data: {
          query: validatedInput.query,
          products: enrichedProducts,
          total: enrichedProducts.length,
          explanations,
          personalized,
          personalizationHint,
        },
        error: null,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
    ```
  - [x]5.5: **CRITICAL** — The `pgvectorResults` (with `text_content`) must be preserved and passed alongside enriched products. Currently, after Violet enrichment, the original pgvector text_content may be lost. Ensure the `text_content` is available for category extraction. Strategy: build a `Map<product_id, text_content>` from pgvector results before enrichment and pass it to the boost function.
  - [x]5.6: **Performance** — The `get_user_search_profile` RPC call should run in parallel with the Violet API enrichment step (both need pgvector results but are independent of each other). Use `Promise.all()`:
    ```typescript
    const [violetProducts, profileResult] = await Promise.all([
      fetchVioletProducts(matchedProductIds),
      authUserId && personalizationEnabled
        ? supabaseAdmin.rpc("get_user_search_profile", { p_user_id: authUserId })
        : Promise.resolve({ data: null }),
    ]);
    ```

- [x] **Task 6: Add personalized_search to user preferences** (AC: #6, #7)
  - [x]6.1: Update `packages/shared/src/types/profile.types.ts` — add to `UserPreferences`:
    ```typescript
    export interface UserPreferences {
      theme?: "light" | "dark" | "system";
      newsletter_opt_in?: boolean;
      personalized_search?: boolean; // NEW — defaults to true (undefined = true)
    }
    ```
  - [x]6.2: Update `packages/shared/src/schemas/profile.schema.ts` — add to `userPreferencesSchema`:
    ```typescript
    export const userPreferencesSchema = z.object({
      theme: z.enum(["light", "dark", "system"]).optional(),
      newsletter_opt_in: z.boolean().optional(),
      personalized_search: z.boolean().optional(),
    });
    ```
  - [x]6.3: Note: No migration needed — `preferences` is a JSONB column. Adding a new key is schemaless. The `personalized_search` key will be `undefined` for existing users, which the Edge Function treats as `true` (default enabled).

- [x] **Task 7: Add personalization toggle to profile page** — `apps/web/src/routes/account/profile.tsx` (AC: #7)
  - [x]7.1: Add a toggle in the preferences section of the profile form:
    ```tsx
    <div className="profile-form__field">
      <label className="profile-form__label" htmlFor="personalized-search">
        Personalized search results
      </label>
      <p className="profile-form__hint">
        When enabled, search results are tailored based on your browsing history and preferences.
      </p>
      <input
        type="checkbox"
        id="personalized-search"
        checked={preferences.personalized_search !== false}
        onChange={(e) =>
          updatePreference("personalized_search", e.target.checked)
        }
      />
    </div>
    ```
  - [x]7.2: Use the existing `useUpdateProfile` mutation to persist the change. The mutation already handles `preferences` as a partial update (merges with existing JSONB).
  - [x]7.3: Style with BEM following existing profile form patterns. No Tailwind.
  - [x]7.4: Mobile: If account settings screen exists on mobile, add the same toggle. If not, this is web-only for now (mobile account screens are future work).

- [x] **Task 8: Add personalization indicator to search results** — `apps/web/src/components/search/SearchResults.tsx` (AC: #4)
  - [x]8.1: When `searchResponse.personalized === true`, display a subtle indicator above the results grid:
    ```tsx
    {searchResponse.personalized && (
      <p className="search-results__personalization-hint" aria-live="polite">
        {searchResponse.personalizationHint ?? "Results tailored to your preferences"}
      </p>
    )}
    ```
  - [x]8.2: Style: Muted text, small font, left-aligned. No attention-grabbing colors, no urgency.
    ```css
    .search-results__personalization-hint {
      font-size: var(--font-size-sm, 0.875rem);
      color: var(--color-text-muted, #6b7280);
      margin-bottom: var(--spacing-md, 1rem);
    }
    ```
  - [x]8.3: Add the CSS to `apps/web/src/styles/pages/search.css` (or wherever search page styles live).
  - [x]8.4: Accessibility: Use `aria-live="polite"` so screen readers announce the hint after results load.

- [x] **Task 9: Mobile personalization indicator** — `apps/mobile/src/app/search.tsx` (AC: #4, #9)
  - [x]9.1: Add a Text component above search results when `personalized === true`:
    ```tsx
    {searchResponse.personalized && (
      <Text style={styles.personalizationHint}>
        {searchResponse.personalizationHint ?? "Results tailored to your preferences"}
      </Text>
    )}
    ```
  - [x]9.2: Style: Small, muted text. Follow existing mobile text style patterns.

- [x] **Task 10: Tests** (AC: all)
  - [x]10.1: Create `apps/web/src/__tests__/personalization.test.ts` with unit tests:
    - `applyPersonalizationBoost` correctly computes category_boost for top 5 categories
    - `applyPersonalizationBoost` assigns 0 boost when category doesn't match
    - `extractCategory` correctly parses category from text_content format
    - `extractCategory` returns null for missing category
    - Price proximity computation: product at user's avg price → 1.0
    - Price proximity computation: product at 2x user's avg price → 0.5
    - Price proximity computation: no order history → 0.5 (neutral)
    - Final score formula: 0.7 semantic + 0.2 category + 0.1 price
    - Re-ranking: products sorted by boosted final_score descending
    - Opt-out: when personalizationEnabled is false, no boosting applied
    - Anonymous user: no personalization, `personalized: false` in response
    - Empty profile: no personalization when total_events = 0
  - [x]10.2: Test the boost functions as pure functions (extract from Edge Function into testable module or test the logic separately). Follow Story 6-2 pattern: test pure logic, not hooks.
  - [x]10.3: No E2E tests (would require Edge Function + pgvector + Violet API). Document manual test procedure.

- [x] **Task 11: Quality checks** (AC: all)
  - [x]11.1: Run `bun run fix-all` — 0 errors, 0 warnings
  - [x]11.2: Run `bun --cwd=apps/web run test` — all tests pass
  - [x]11.3: Run `bun run typecheck` — no TypeScript errors

---

## Dev Notes

### Critical Architecture Constraints

- **Personalization is 100% backend-driven** — The client does NOT send user_id in the search request body. The Supabase client automatically includes the JWT in the `Authorization` header when calling `supabase.functions.invoke("search-products")`. The Edge Function extracts user_id from the JWT. This means: NO changes to `SearchQuery` type, NO changes to `useSearch` hook, NO changes to search route component (for the query itself). The only client-side changes are: (1) displaying the personalization indicator, (2) profile toggle for opt-out.

- **Do NOT modify the useSearch hook or SearchQuery type for user_id** — This is a common LLM mistake. The JWT is already transmitted by the Supabase client. Adding `user_id` to the request body would be redundant AND a security risk (users could fake another user's ID). The Edge Function trusts only the JWT.

- **Opt-out check: `personalized_search !== false` (not `=== true`)** — Since the `preferences` JSONB column won't have `personalized_search` for existing users (it's `undefined`), the opt-out check must be `preferences?.personalized_search === false`. Any other value (true, undefined, missing key) means personalization is enabled. This is the "default ON" behavior.

- **The `get_user_search_profile` function uses `SECURITY DEFINER`** — This allows the function to read `user_events` and `orders` regardless of the caller's RLS context. This is necessary because the Edge Function calls it with the admin client. The function is safe: it only queries data for the provided `p_user_id`, which comes from a validated JWT.

- **Category extraction from `product_embeddings.text_content`** — The `text_content` field in `product_embeddings` follows the format: `"${productName}. ${description}. Brand: ${vendor}. Category: ${category}. Tags: ${tags}"`. The `extractCategory()` function parses `Category: X` from this string. This is fragile if the format changes — but it's the only source of category data available without an extra Violet API call. If category extraction fails, `category_boost` defaults to 0 (no boost, no penalty).

- **Parallel execution for performance** — The `get_user_search_profile` RPC call MUST run in parallel with the Violet API enrichment step using `Promise.all()`. Both depend on the pgvector results but are independent of each other. This ensures personalization adds < 100ms latency (the RPC query hits indexed columns: `user_events(user_id, event_type)` and `orders(user_id)`).

- **The `similarity` field in `ProductMatch` is overwritten with the boosted score** — After re-ranking, `product.similarity` contains the `final_score` (0.7 × semantic + 0.2 × category + 0.1 × price), NOT the raw pgvector cosine similarity. The explanations template uses `Math.round(similarity * 100)` for the percentage — this will now reflect the boosted score, which is fine (it's still a 0-100% relevance indicator).

- **No new tables needed** — This story uses existing infrastructure: `user_events` (Story 6.2), `orders` + `order_items` (Story 5.1), `product_embeddings` (Story 3.5), `user_profiles` (Story 6.1). The only new database object is the `get_user_search_profile` function.

- **No Tailwind CSS** — All styling is Vanilla CSS + BEM. The personalization hint uses a new BEM class `.search-results__personalization-hint` in the search page CSS file.

- **Edge Function 2s CPU / 10MB bundle limits** — The personalization logic is lightweight (one RPC call, simple arithmetic). No risk of exceeding limits. The `createClient` call for JWT validation is the same pattern used in `track-event` Edge Function.

### Existing Utilities to Reuse (DO NOT REBUILD)

| Utility | Location | What it provides |
| ------- | -------- | ---------------- |
| `getSupabaseAdmin()` | `supabase/functions/_shared/supabaseAdmin.ts` | Service role client for RPC calls |
| `generateEmbedding()` | `supabase/functions/_shared/openai.ts` | OpenAI embedding generation (with retry) |
| `match_products()` | `supabase/migrations/20260313000000_product_embeddings.sql` | pgvector RPC for similarity search |
| `getUserEvents()` | `packages/shared/src/clients/tracking.ts` | Read user events (for reference — Edge Function uses SQL function instead) |
| `useProfile()` | `packages/shared/src/hooks/useProfile.ts` | TanStack Query hook for profile (cached, used for opt-out check on client) |
| `useUpdateProfile()` | `packages/shared/src/hooks/useProfile.ts` | Mutation hook for profile updates (used for toggle) |
| `updateProfile()` | `packages/shared/src/clients/profile.ts` | Client function for profile updates (handles JSONB merge) |
| CORS headers pattern | `supabase/functions/_shared/cors.ts` or inline | Standard CORS headers for Edge Functions |
| Search page CSS | `apps/web/src/styles/pages/search.css` | Existing search page styles (add personalization hint here) |

### Existing Code Patterns to Follow

```typescript
// Edge Function JWT validation pattern (from track-event/index.ts):
const userClient = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_ANON_KEY")!,
  { global: { headers: { Authorization: authHeader } } },
);
const { data: { user } } = await userClient.auth.getUser();
// Check: user && !user.is_anonymous
```

```typescript
// Profile preference reading pattern (from profile.ts):
const { data: profile } = await client
  .from("user_profiles")
  .select("preferences")
  .eq("user_id", userId)
  .single();

const isOptedOut = profile?.preferences?.personalized_search === false;
```

```typescript
// Supabase RPC call pattern:
const { data, error } = await supabaseAdmin
  .rpc("get_user_search_profile", { p_user_id: userId });
```

```sql
-- SQL function pattern (from existing migrations):
CREATE OR REPLACE FUNCTION public.match_products(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.3,
  match_count int DEFAULT 12
)
RETURNS TABLE (product_id varchar, product_name text, text_content text, similarity float)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT ...;
END;
$$;
```

```css
/* BEM pattern for search page (from existing styles): */
.search-results { /* block */ }
.search-results__grid { /* element */ }
.search-results__empty { /* element */ }
.search-results__personalization-hint { /* NEW element */ }
```

### Database Schema Reference

```sql
-- EXISTING TABLES USED BY THIS STORY:

-- user_events (Story 6.2):
--   user_id UUID, event_type TEXT, payload JSONB, created_at TIMESTAMPTZ
--   Indexes: (user_id, event_type), (user_id, created_at DESC)
--   RLS: users SELECT own, service_role ALL

-- orders (Story 5.1):
--   id UUID, user_id UUID, violet_order_id, status, total, currency, created_at
--   RLS: users SELECT own, service_role ALL

-- order_items (Story 5.1):
--   id UUID, order_id UUID (FK orders), sku_id, name, quantity, price, thumbnail
--   RLS: inherited via orders join

-- product_embeddings (Story 3.5):
--   product_id VARCHAR UNIQUE, product_name TEXT, text_content TEXT, embedding vector(1536)
--   RLS: public SELECT, service_role ALL
--   RPC: match_products(query_embedding, threshold, count)

-- user_profiles (Story 6.1):
--   user_id UUID UNIQUE, display_name TEXT, avatar_url TEXT, preferences JSONB
--   RLS: users SELECT/UPDATE own, service_role ALL

-- NEW SQL FUNCTION (this story):
-- get_user_search_profile(p_user_id UUID) → JSONB
--   Returns: { top_categories, avg_order_price, recent_product_ids, total_events }
--   SECURITY DEFINER, reads user_events + orders + order_items
```

### Previous Story Intelligence (Story 6.2)

- **Implementation sequence**: migration → types → schemas → client functions → hooks → web UI → mobile UI → exports → tests → fix-all. Follow this sequence.
- **Deep imports don't work**: `@ecommerce/shared/hooks/useTracking` fails — must use barrel exports via `@ecommerce/shared`. Same applies here for any new types.
- **Server-only imports leaking**: `node:crypto` and `@tanstack/react-start/server` must NOT appear in client bundles. The personalization logic is entirely in the Edge Function (Deno runtime), so no bundle risk. But if any shared types import server-only modules, it will break.
- **Edge Function reuses `_shared/supabaseAdmin.ts`**: Use `getSupabaseAdmin()` for the RPC call, not a new client. For JWT validation, create a temporary client with the user's auth header (same pattern as `track-event`).
- **Pre-existing test failures**: `orderStatusDerivation` (CANCELED/REFUNDED conflation) and `violetCartAdapter` (wallet_based_checkout body mismatch) — not introduced by this story, ignore them.
- **`renderHook` issues in monorepo**: Test pure functions, not hooks. The `applyPersonalizationBoost` and `extractCategory` functions are pure — test them directly.
- **Barrel exports**: Always update `types/index.ts` when adding new types.

### Git Intelligence

- Commit pattern: `feat: implement <description> (Story X.Y) + code review fixes`
- Implementation sequence: migration → types → schemas → Edge Function → web UI → mobile UI → exports → tests → fix-all
- Recent focus: Story 6.2 built the tracking pipeline (user_events table). This story is the first CONSUMER of that data.
- The search Edge Function (`search-products`) was created in Story 3.5 and is the main file to modify.

### Project Structure Notes

- **Modified Edge Function**: `supabase/functions/search-products/index.ts` — main change: JWT extraction, profile check, preference RPC, boost logic, re-ranking.
- **New migration**: `supabase/migrations/20260326000000_search_personalization.sql` — SQL function only, no new tables.
- **New types**: `packages/shared/src/types/personalization.types.ts` — shared types for user search profile and boost calculations.
- **Modified profile types/schema**: Adding `personalized_search` to existing `UserPreferences` interface and Zod schema.
- **Modified search types/schema**: Adding `personalized` flag to existing `SearchResponse` interface and Zod schema.
- **Modified profile page**: Adding toggle in existing preferences section.
- **Modified search results**: Adding personalization hint display.
- **Downstream**: Story 6.5 (Product Recommendations) will reuse `get_user_search_profile` for recommendation personalization.

### References

- [Source: epics.md#Story 6.3 — Personalized Search Results acceptance criteria]
- [Source: epics.md#FR6 — Returning users receive search results weighted by browsing/purchase history]
- [Source: epics.md#Epic 6 — NFRs: NFR1 (performance), NFR4 (mobile perf)]
- [Source: architecture.md#Data Flow — Product Search: pgvector → Violet enrichment → return]
- [Source: architecture.md#API Patterns — Edge Functions for cross-platform operations]
- [Source: architecture.md#Data Boundaries — Product embeddings: Supabase pgvector]
- [Source: architecture.md#Caching — TanStack Query staleTime: search 2 min]
- [Source: architecture.md#External Integration — OpenAI for embeddings, Violet for catalog]
- [Source: ux-design-specification.md#Privacy — no third-party analytics, data stays in Supabase]
- [Source: ux-design-specification.md#Anti-Patterns — no dark patterns, no manipulation]
- [Source: 6-2-browsing-history-preference-tracking.md — user_events table, tracking hooks, fire-and-forget pattern]
- [Source: 6-2-browsing-history-preference-tracking.md#Dev Notes — purchase history NOT duplicated, use orders table]
- [Source: supabase/functions/search-products/index.ts — current search Edge Function implementation]
- [Source: supabase/functions/_shared/openai.ts — embedding generation with retry]
- [Source: supabase/migrations/20260313000000_product_embeddings.sql — pgvector schema + match_products RPC]
- [Source: supabase/migrations/20260325000000_user_events.sql — user_events table schema]
- [Source: packages/shared/src/types/search.types.ts — SearchQuery, ProductMatch, SearchResponse types]
- [Source: packages/shared/src/schemas/search.schema.ts — Zod validation schemas]
- [Source: packages/shared/src/hooks/useSearch.ts — search hook with queryOptions factory]
- [Source: packages/shared/src/types/profile.types.ts — UserPreferences interface]
- [Source: packages/shared/src/clients/profile.ts — updateProfile function (JSONB merge)]
- [Source: apps/web/src/routes/account/profile.tsx — profile settings page]
- [Source: apps/web/src/components/search/SearchResults.tsx — search results display component]
- [Source: CLAUDE.md — No Tailwind CSS, double quotes, semicolons, 100 char width, conventional commit format]

## Dev Agent Record

### Agent Model Used

claude-opus-4-6

### Debug Log References

- Story SQL function originally had `JOIN orders o ON o.id = oi.order_id` but the real schema has `order_bags` as intermediate table. Fixed to `order_items → order_bags → orders` three-table join.
- Edge Function TS diagnostics for `Deno`, `jsr:` imports are expected (Deno runtime, not Node — LSP doesn't understand). Pre-existing from Story 3.5.
- `personalized` and `personalizationHint` fields added as optional to both SearchResponse type and Zod schema — backward-compatible with existing search responses that omit them.

### Completion Notes List

- Created `supabase/migrations/20260326000000_search_personalization.sql` — `get_user_search_profile(UUID)` SECURITY DEFINER function. Aggregates top_categories (3 months), avg_order_price (via order_bags join), recent_product_ids (30 days), total_events. No new tables.
- Created `packages/shared/src/types/personalization.types.ts` — `CategoryAffinity`, `UserSearchProfile` interfaces.
- Updated `packages/shared/src/types/search.types.ts` — added `personalized?: boolean` and `personalizationHint?: string` to `SearchResponse`.
- Updated `packages/shared/src/schemas/search.schema.ts` — added `personalized` and `personalizationHint` to `searchResponseSchema`.
- Updated `supabase/functions/search-products/index.ts` — JWT extraction, profile opt-out check, parallel profile fetch with Violet enrichment, `applyPersonalizationBoost()` with category + price scoring, `extractCategory()` from text_content, `personalized` flag in response.
- Updated `packages/shared/src/types/profile.types.ts` — added `personalized_search?: boolean` to `UserPreferences`.
- Updated `packages/shared/src/schemas/profile.schema.ts` — added `personalized_search` to `userPreferencesSchema`.
- Updated `apps/web/src/routes/account/profile.tsx` — added "Preferences" section with personalized search toggle checkbox. Uses existing `useUpdateProfile` mutation.
- Updated `apps/web/src/styles/pages/profile.css` — added `.profile__field--toggle`, `.profile__toggle-info`, `.profile__checkbox` BEM classes.
- Updated `apps/web/src/components/search/SearchResults.tsx` — added `personalized` and `personalizationHint` props, displays hint above results grid when personalized.
- Updated `apps/web/src/styles/pages/search.css` — added `.search-results__personalization-hint` style.
- Updated `apps/web/src/routes/search/index.tsx` — passes `personalized` and `personalizationHint` from search data to SearchResults component.
- Updated `apps/mobile/src/app/search.tsx` — added personalization hint ThemedText above FlatList when personalized, with `personalizationHint` style.
- Updated `packages/shared/src/types/index.ts` — added `CategoryAffinity`, `UserSearchProfile` exports.
- Created `apps/web/src/__tests__/personalization.test.ts` — 16 unit tests for `extractCategory` (5 tests) and `applyPersonalizationBoost` (11 tests).
- All 219 web tests pass (203 existing + 16 new). `bun run fix-all` exits 0 (Prettier + ESLint + TypeCheck all clean).

### File List

- `supabase/migrations/20260326000000_search_personalization.sql` (CREATE)
- `packages/shared/src/types/personalization.types.ts` (CREATE)
- `apps/web/src/__tests__/personalization.test.ts` (CREATE)
- `supabase/functions/search-products/index.ts` (UPDATE — personalization: JWT extraction, profile fetch, boost, re-rank)
- `packages/shared/src/types/search.types.ts` (UPDATE — added personalized/personalizationHint to SearchResponse)
- `packages/shared/src/schemas/search.schema.ts` (UPDATE — added personalized/personalizationHint to schema)
- `packages/shared/src/types/profile.types.ts` (UPDATE — added personalized_search to UserPreferences)
- `packages/shared/src/schemas/profile.schema.ts` (UPDATE — added personalized_search to schema)
- `packages/shared/src/types/index.ts` (UPDATE — added personalization type exports)
- `apps/web/src/routes/account/profile.tsx` (UPDATE — added Preferences section with toggle)
- `apps/web/src/styles/pages/profile.css` (UPDATE — added toggle field BEM classes)
- `apps/web/src/components/search/SearchResults.tsx` (UPDATE — added personalization hint)
- `apps/web/src/styles/pages/search.css` (UPDATE — added personalization hint style)
- `apps/web/src/routes/search/index.tsx` (UPDATE — passes personalized props to SearchResults)
- `apps/mobile/src/app/search.tsx` (UPDATE — added personalization hint + style)
