# Story 3.4: Product Filtering & Sorting (Web + Mobile)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **visitor**,
I want to filter and sort product results by relevance, price, and availability,
so that I can quickly narrow down to products that match my criteria.

## Acceptance Criteria

1. **Given** a visitor is on the product listing page
   **When** they view the filter area
   **Then** 3-5 essential filter chips are available: "All", "Under $50", "Under $100", "$100–$200", "$200+", "In Stock"
   **And** filters use horizontal scrollable chip bar (consistent with existing CategoryChips pattern)

2. **Given** a visitor selects a filter chip
   **When** the chip becomes active
   **Then** the product list updates in-place via TanStack Query with updated query params
   **And** active chip uses filled style (`--color-midnight` bg, white text)
   **And** multiple price + availability chips can be combined
   **And** "All" chip clears all active filters

3. **Given** a visitor applies sorting
   **When** they select a sort option
   **Then** sorting options include: Relevance (default), Price: Low to High, Price: High to Low
   **And** sort selection is via a minimal `<select>` dropdown (not a chip — sort is single-value)
   **And** the product list re-fetches with the sort parameter applied

4. **Given** filters or sorting are applied on web
   **When** the URL updates
   **Then** URL reflects filter state via query params: `?category=Home&minPrice=0&maxPrice=5000&inStock=true&sortBy=price&sortDirection=ASC`
   **And** filter state is shareable and bookmarkable
   **And** navigating to a product and pressing back retains the filter state

5. **Given** a visitor is on mobile
   **When** they want to filter/sort
   **Then** filters and sort are accessible via the same horizontal chip pattern
   **And** sort dropdown sits inline above the grid (same as web)

6. **Given** filters result in zero products
   **When** the empty state renders
   **Then** a helpful message is shown: "No products match your filters."
   **And** a "Clear filters" button resets to default state

7. **Given** the product count area
   **When** filters are applied
   **Then** the count updates in real-time: "Showing 4 of 4 products" (reflects filtered total)
   **And** `aria-live="polite"` announces changes for screen readers

## Tasks / Subtasks

- [x] Task 1: Extend `ProductQuery` type with filter/sort params (AC: 1, 3, 4)
  - [x] 1.1 Add to `packages/shared/src/types/product.types.ts` `ProductQuery`: `minPrice?: number`, `maxPrice?: number`, `inStock?: boolean`, `sortBy?: "relevance" | "price"`, `sortDirection?: "ASC" | "DESC"`
  - [x] 1.2 Update `queryKeys.products.list()` — the existing factory already accepts `ProductQuery` params, so new fields auto-include in cache key (verify)
  - [x] 1.3 No barrel export changes needed (ProductQuery already exported)

- [x] Task 2: Update VioletAdapter to pass filter/sort params to Violet API (AC: 1, 3)
  - [x] 2.1 In `packages/shared/src/adapters/violetAdapter.ts` `getProducts()`, extend the `body` construction:
    - If `params.minPrice` defined → `body.min_price = params.minPrice` (integer cents)
    - If `params.maxPrice` defined → `body.max_price = params.maxPrice` (integer cents)
    - If `params.inStock === true` → `body.available = true` (boolean, NOT string "AVAILABLE")
    - If `params.sortBy === "price"` → `body.sort_by = "minPrice"` (camelCase property name per Violet API), `body.sort_direction = params.sortDirection ?? "ASC"`
  - [x] 2.2 For "relevance" sort: send no `sort_by`/`sort_direction` params (Violet default is relevance)
  - [x] 2.3 **CRITICAL — Violet API sort_by uses camelCase property names** (e.g., `minPrice`, `name`, `dateCreated`), NOT snake_case. This is confirmed from the OpenAPI spec.
  - [x] 2.4 **IMPORTANT**: Violet's `sort_by`/`sort_direction` are NOT supported when `beta=true` (enhanced/NLP mode). Our current adapter does NOT use `beta=true`, so sort should work. If Violet rejects sort params, implement client-side fallback sort.

- [x] Task 3: Update `getProductsFn` Server Function to pass all params (AC: 1, 3)
  - [x] 3.1 In `apps/web/src/server/getProducts.ts` `getProductsFn` handler, pass all `ProductQuery` fields through to `adapter.getProducts()`:
    ```typescript
    return adapter.getProducts({
      category: data.category,
      page: data.page ?? 1,
      pageSize: data.pageSize ?? 12,
      minPrice: data.minPrice,
      maxPrice: data.maxPrice,
      inStock: data.inStock,
      sortBy: data.sortBy,
      sortDirection: data.sortDirection,
    });
    ```
  - [x] 3.2 `inputValidator` already accepts `ProductQuery` — no change needed

- [x] Task 4: Update `/products` route to handle filter/sort URL params (AC: 4, 7)
  - [x] 4.1 In `apps/web/src/routes/products/index.tsx`, extend `validateSearch` to parse all filter params:
    ```typescript
    validateSearch: (search: Record<string, unknown>): ProductSearchParams => ({
      category: (search.category as string) || undefined,
      minPrice: search.minPrice ? Number(search.minPrice) : undefined,
      maxPrice: search.maxPrice ? Number(search.maxPrice) : undefined,
      inStock: search.inStock === "true" ? true : undefined,
      sortBy: (search.sortBy as "relevance" | "price") || undefined,
      sortDirection: (search.sortDirection as "ASC" | "DESC") || undefined,
    }),
    ```
  - [x] 4.2 Update `loaderDeps` to include all search params (currently only `search`)
  - [x] 4.3 Pass all filter params to `productsInfiniteQueryOptions` in the loader
  - [x] 4.4 Reset infinite query (start from page 1) when any filter/sort changes — already handled since `queryKey` includes params

- [x] Task 5: Create `FilterChips` component (AC: 1, 2, 6)
  - [x] 5.1 Create `apps/web/src/components/product/FilterChips.tsx`
  - [x] 5.2 Props: `activeFilters: { minPrice?: number; maxPrice?: number; inStock?: boolean }`, `onFilterChange: (filters) => void`
  - [x] 5.3 Render predefined filter options as chips:
    - "All" (clears all) — always first
    - "Under $50" → `{ maxPrice: 5000 }`
    - "Under $100" → `{ maxPrice: 10000 }`
    - "$100–$200" → `{ minPrice: 10000, maxPrice: 20000 }`
    - "$200+" → `{ minPrice: 20000 }`
    - "In Stock" → `{ inStock: true }`
  - [x] 5.4 Multi-select: price chip + "In Stock" can be combined (but price chips are mutually exclusive)
  - [x] 5.5 Active chip styling: `--color-midnight` bg, white text (same as CategoryChips)
  - [x] 5.6 Accessibility: `role="group"` with `aria-label="Filter options"`, each chip `aria-pressed="true/false"`
  - [x] 5.7 BEM: `filter-chips`, `filter-chips__list`, `filter-chips__item`, `filter-chips__item--active`

- [x] Task 6: Create `SortSelect` component (AC: 3)
  - [x] 6.1 Create `apps/web/src/components/product/SortSelect.tsx`
  - [x] 6.2 Props: `sortBy?: "relevance" | "price"`, `sortDirection?: "ASC" | "DESC"`, `onSortChange: (sortBy, sortDirection) => void`
  - [x] 6.3 Render as native `<select>` (accessible, minimal, no custom dropdown library):
    - "Relevance" (default) → `sortBy: undefined`
    - "Price: Low to High" → `sortBy: "price", sortDirection: "ASC"`
    - "Price: High to Low" → `sortBy: "price", sortDirection: "DESC"`
  - [x] 6.4 BEM: `sort-select`, `sort-select__label`, `sort-select__dropdown`
  - [x] 6.5 Label text: "Sort by" (visible, not just aria-label)

- [x] Task 7: Integrate FilterChips and SortSelect into product listing page (AC: 1–7)
  - [x] 7.1 In `apps/web/src/routes/products/index.tsx` `ProductListingPage` component:
    - Add `FilterChips` below `CategoryChips`
    - Add `SortSelect` next to the result count (right-aligned on desktop)
  - [x] 7.2 Filter/sort changes call `navigate({ search: { ...currentSearch, ...newFilters } })` to update URL
  - [x] 7.3 Layout: CategoryChips row → FilterChips row → [count | sort] row → ProductGrid
  - [x] 7.4 "Clear filters" button in empty state resets all filter/sort params
  - [x] 7.5 Verify `pendingComponent` still works (shows skeleton during filter transitions)
  - [x] 7.6 Update `ProductListingPending` to include filter/sort skeleton placeholders

- [x] Task 8: CSS for FilterChips and SortSelect (AC: 1, 3)
  - [x] 8.1 Create `apps/web/src/components/product/FilterChips.css`
  - [x] 8.2 Same horizontal scroll + chip styling as CategoryChips (DRY: share variables, don't duplicate)
  - [x] 8.3 Create `apps/web/src/components/product/SortSelect.css`
  - [x] 8.4 Style native `<select>`: transparent bg, minimal border, `--font-body`, aligned right
  - [x] 8.5 Update `apps/web/src/styles/index.css` with new CSS imports
  - [x] 8.6 Create/update `apps/web/src/styles/pages/products-page.css` for the toolbar layout (count + sort in a flex row)

- [x] Task 9: Mobile filter/sort implementation (AC: 5)
  - [x] 9.1 In `apps/mobile/src/app/products/index.tsx`, add filter chips as a horizontal `ScrollView`
  - [x] 9.2 Add sort as a `Picker` or styled equivalent (React Native simple Button with ActionSheet)
  - [x] 9.3 Filter state managed via React state (no URL routing on mobile — Expo Router doesn't support search params the same way)
  - [x] 9.4 Reuse the same predefined filter options as web

- [x] Task 10: Tests (AC: 1–7)
  - [x] 10.1 Create `apps/web/src/components/product/__tests__/FilterChips.test.tsx`:
    - Renders all filter chip options
    - Clicking chip triggers `onFilterChange` with correct params
    - Active filter shows `--active` modifier
    - "All" chip clears all filters
    - Multi-select: price + inStock combination
  - [x] 10.2 Create `apps/web/src/components/product/__tests__/SortSelect.test.tsx`:
    - Renders all sort options
    - Changing selection triggers `onSortChange`
    - Default selection is "Relevance"
  - [x] 10.3 Add integration test in existing product listing tests: filter params are passed to query options

- [x] Task 11: Quality checks (AC: 1–7)
  - [x] 11.1 Run `bun run fix-all` (Prettier + ESLint + TypeScript check)
  - [x] 11.2 Run `bun --cwd=apps/web run test` — must not regress (143 passing)
  - [x] 11.3 Verify SSR: `curl 'localhost:3000/products?maxPrice=5000&sortBy=price&sortDirection=ASC'` returns filtered HTML
  - [x] 11.4 Verify URL state preservation: apply filters → click product → back button → filters retained

## Dev Notes

### Violet API — Search Offers Filtering & Sorting

#### Key Endpoint: POST /catalog/offers/search

```
POST /catalog/offers/search?page=0&size=12
```

**Query Parameters:**
| Param | Type | Description |
|---|---|---|
| `page` | int | 0-based page number (our adapter converts from 1-based) |
| `size` | int | Results per page (default 20, we use 12) |
| `extended` | bool | Returns full offer data (default false) |
| `beta` | bool | Enhanced search mode — faster but `sort_by`/`sort_direction` NOT supported |

**Request Body (JSON) — `OfferSearchRequest` (all fields optional):**

| Field | Type | Description |
|---|---|---|
| `query` | string | NLP search term (**only works with `?beta=true`**) |
| `source_category_name` | string | Filter by category name (our adapter sends as `category`) |
| `merchant_id` | int32 | Filter by single merchant (already used) |
| `merchant_ids` | int32[] | Filter by multiple merchants |
| `seller` | string | Filter by merchant name |
| `vendor` | string | Filter by brand name |
| `name` | string | Filter by product name |
| `min_price` | int32 | Minimum price in **cents** (e.g., 5000 = $50.00) |
| `max_price` | int32 | Maximum price in **cents** (e.g., 10000 = $100.00) |
| `available` | boolean | Filter by stock availability (`true` = in stock only) |
| `visible` | boolean | Filter by storefront visibility |
| `status` | enum | `AVAILABLE`, `UNAVAILABLE`, `DISABLED_AVAILABLE`, `DISABLED_UNAVAILABLE`, `ARCHIVED`, `FOR_DELETION` |
| `tags` | string[] | Filter by product tags |
| `sort_by` | string | **camelCase** property name to sort by (e.g., `minPrice`, `name`, `dateCreated`) |
| `sort_direction` | string | `"ASC"` or `"DESC"` |

**CRITICAL — Sort field naming:**
- `sort_by` uses **camelCase Offer property names**: `minPrice`, `name`, `dateCreated`, `dateLastModified`
- NOT snake_case — `min_price` is for filtering, `minPrice` is for sorting

**CRITICAL — Sort Compatibility:**
- Our adapter does NOT use `beta=true`, so `sort_by`/`sort_direction` body params should work
- If Violet rejects or ignores sort params, implement **client-side fallback**: sort `allProducts` array by `minPrice` before rendering
- Client-side sort is acceptable for MVP since we paginate with "Load more" (all loaded products are in memory)

**CRITICAL — `available` is a boolean, not a string:**
- Pass `available: true` in the body to filter in-stock products
- Do NOT pass `availability: "AVAILABLE"` — that field name doesn't exist

**Price filtering precision:**
- All prices in Violet API are integer cents
- Our filter chips map to cent values: "Under $50" = `max_price: 5000`
- Pass cents directly — do NOT divide by 100

#### Filter/Sort Strategy for This Story

**Server-side (preferred):** Pass `min_price`, `max_price`, `availability` in the POST body. Pass `sort` in query params. Violet returns pre-filtered, pre-sorted results with correct pagination.

**Client-side fallback (if Violet sort doesn't work):** Sort the `allProducts` array in the component before passing to `ProductGrid`. Price sort: `allProducts.sort((a, b) => a.minPrice - b.minPrice)`. This works with "Load more" since all loaded products are available in memory via infinite query `data.pages.flatMap(...)`.

### Architecture Compliance

#### URL State Management Pattern

TanStack Router's `validateSearch` + `navigate({ search })` pattern:

```typescript
// Route definition
validateSearch: (search: Record<string, unknown>) => ({
  category: (search.category as string) || undefined,
  minPrice: search.minPrice ? Number(search.minPrice) : undefined,
  maxPrice: search.maxPrice ? Number(search.maxPrice) : undefined,
  inStock: search.inStock === "true" ? true : undefined,
  sortBy: (search.sortBy as "relevance" | "price") || undefined,
  sortDirection: (search.sortDirection as "ASC" | "DESC") || undefined,
}),

// Navigation (in component)
navigate({
  search: (prev) => ({ ...prev, minPrice: 5000, maxPrice: undefined }),
});
```

**Key points:**
- `loaderDeps: ({ search }) => search` — already in place, will detect filter changes automatically
- Query key includes all params via `queryKeys.products.list(params)` — cache invalidation is automatic
- Infinite query restarts from page 1 when params change (query key change = new query)
- Back/forward navigation restores filter state because it's in the URL

#### FilterChips Component Pattern

Follow the same component pattern as `CategoryChips`:
- Horizontal scrollable chip bar with fade gradient at edges
- `aria-pressed` toggle state on each chip
- Parent controls state via callback (chips are controlled components)
- BEM naming with `--active` modifier for selected state

The key difference: CategoryChips is single-select (only one category), FilterChips supports multi-select (price range + availability can combine). Price range chips are mutually exclusive (selecting "Under $50" deselects "$100-$200").

#### Product Listing Page Layout Update

```
+-----------------------------------------------------+
| Products (h1)                                       |
+-----------------------------------------------------+
| [All] [Home] [Fashion] [Gifts] [Beauty]   <- cats  |
+-----------------------------------------------------+
| [All] [<$50] [<$100] [$100-200] [$200+] [In Stock] |
+-----------------------------------------------------+
| Showing 12 of 48 products     Sort by: [v Relevance]|
+-----------------------------------------------------+
| +-----+ +-----+ +-----+ +-----+                    |
| |Card | |Card | |Card | |Card |                    |
| +-----+ +-----+ +-----+ +-----+                    |
|         [Load more]                                  |
+-----------------------------------------------------+
```

#### CSS Architecture

New CSS files follow BEM convention. FilterChips styling should NOT duplicate CategoryChips CSS — extract shared chip variables to `tokens.css` or use the same BEM base class with a modifier.

```css
/* filter-chips — reuses chip styling pattern from category-chips */
.filter-chips { }
.filter-chips__list { }  /* horizontal scroll container */
.filter-chips__item { }  /* outlined chip */
.filter-chips__item--active { }  /* filled chip */

/* sort-select — minimal dropdown */
.sort-select { }
.sort-select__label { }
.sort-select__dropdown { }
```

### Existing Code to Reuse (DO NOT REINVENT)

| What | Where | How to Use |
|---|---|---|
| `CategoryChips` pattern | `apps/web/src/components/product/CategoryChips.tsx` | Mirror pattern for FilterChips (accessibility, BEM, controlled component) |
| `CategoryChips.css` | `apps/web/src/components/product/CategoryChips.css` | Reference for chip styling (may share CSS custom properties) |
| `ProductQuery` type | `packages/shared/src/types/product.types.ts:162-168` | Extend with new filter/sort fields |
| `productsInfiniteQueryOptions` | `packages/shared/src/hooks/useProducts.ts:119-143` | Already accepts `Omit<ProductQuery, "page">` — new fields auto-flow |
| `queryKeys.products.list()` | `packages/shared/src/utils/constants.ts:25` | Already accepts `ProductQuery` — new fields auto-include in cache key |
| `VioletAdapter.getProducts()` | `packages/shared/src/adapters/violetAdapter.ts:124-164` | Extend body construction with new params |
| `getProductsFn` | `apps/web/src/server/getProducts.ts:96-105` | Pass all ProductQuery fields through |
| Products route | `apps/web/src/routes/products/index.tsx` | Extend validateSearch, add FilterChips + SortSelect |
| `formatPrice()` | `packages/shared/src/utils/formatPrice.ts` | For displaying price thresholds in filter chip labels |
| `Skeleton` component | `apps/web/src/components/Skeleton.tsx` | For filter/sort area skeleton in pending state |
| Mobile products screen | `apps/mobile/src/app/products/index.tsx` | Add filter/sort UI to mobile listing |

### File Structure

#### Files to CREATE

```
# Web — Components
apps/web/src/components/product/FilterChips.tsx          # Price & availability filter chips
apps/web/src/components/product/FilterChips.css          # Filter chip styles
apps/web/src/components/product/SortSelect.tsx           # Sort dropdown component
apps/web/src/components/product/SortSelect.css           # Sort dropdown styles

# Web — Page Styles
apps/web/src/styles/pages/products-page.css              # Toolbar layout (count + sort flex row)

# Tests
apps/web/src/components/product/__tests__/FilterChips.test.tsx   # Filter chip tests
apps/web/src/components/product/__tests__/SortSelect.test.tsx    # Sort select tests
```

#### Files to MODIFY

```
packages/shared/src/types/product.types.ts               # Add minPrice, maxPrice, inStock, sortBy, sortDirection to ProductQuery
packages/shared/src/adapters/violetAdapter.ts             # Extend getProducts() body with filter/sort params
apps/web/src/server/getProducts.ts                        # Pass all ProductQuery fields to adapter
apps/web/src/routes/products/index.tsx                    # Extend validateSearch, add FilterChips + SortSelect + toolbar
apps/web/src/styles/index.css                            # Add new CSS imports
apps/mobile/src/app/products/index.tsx                   # Add filter/sort UI (horizontal chips + picker)
```

#### DO NOT TOUCH

```
packages/shared/src/hooks/useProducts.ts                  # Already accepts full ProductQuery — no changes needed
packages/shared/src/utils/constants.ts                    # queryKeys already accepts ProductQuery — auto-include new fields
packages/shared/src/adapters/adapterFactory.ts            # No change needed
packages/shared/src/schemas/product.schema.ts             # Zod schema for API response, not search params
apps/web/src/components/product/CategoryChips.tsx         # Category selection unchanged
apps/web/src/components/product/CategoryChips.css         # Reference only — do not modify
apps/web/src/components/product/ProductCard.tsx           # Card rendering unchanged
apps/web/src/components/product/ProductGrid.tsx           # Grid rendering unchanged
apps/web/src/components/product/ProductDetail.tsx         # PDP unchanged
apps/web/src/router.tsx                                   # Router config unchanged
apps/web/src/routes/__root.tsx                           # Root layout unchanged
apps/web/src/routes/products/$productId.tsx              # PDP route unchanged
```

### Library / Framework Requirements

| Library | Version | Purpose | Notes |
|---------|---------|---------|-------|
| `@tanstack/react-query` | v5.x (already installed) | `useSuspenseInfiniteQuery` | No new deps |
| `@tanstack/react-router` | (already installed) | `validateSearch`, `useNavigate`, `useSearch` | No new deps |
| `@tanstack/react-start` | (already installed) | `createServerFn` | No new deps |

**No new dependencies required.** This story only extends existing types and components.

### Testing Requirements

1. **FilterChips tests** (`apps/web/src/components/product/__tests__/FilterChips.test.tsx`):
   - Renders all predefined filter options
   - Clicking "Under $50" triggers `onFilterChange({ maxPrice: 5000 })`
   - Clicking "All" clears all filters
   - Active chip has `filter-chips__item--active` class
   - Price chips are mutually exclusive
   - "In Stock" can combine with price chips
   - Accessibility: `role="group"`, `aria-pressed` toggles

2. **SortSelect tests** (`apps/web/src/components/product/__tests__/SortSelect.test.tsx`):
   - Renders 3 sort options (Relevance, Price Low-High, Price High-Low)
   - Default selection is Relevance
   - Changing to "Price: Low to High" triggers `onSortChange("price", "ASC")`
   - Accessible `<select>` with `<label>`

3. **Integration**: Verify that applying filters changes the infinite query's query key (cache key changes = new fetch)

4. **Quality checks**:
   - `bun run fix-all` must pass
   - `bun --cwd=apps/web run test` must not regress (143 tests passing from Story 3.3)
   - Manual: `curl 'localhost:3000/products?maxPrice=5000'` returns filtered product HTML

### Previous Story Intelligence (Story 3.3)

From Story 3.3 (most recent completed story), critical learnings:

1. **143 tests currently passing** (96 web + 47 shared) — must not regress
2. **Route tree regeneration**: no new routes in this story (only modifying existing `/products/index.tsx`), so `bunx @tanstack/router-cli generate` is NOT needed
3. **CSS import order** in `styles/index.css`: tokens -> base -> utilities -> components -> pages. New component CSS goes in components section, page CSS in pages section
4. **Component-colocated CSS**: CSS files live next to their component `.tsx` files (e.g., `FilterChips.css` alongside `FilterChips.tsx`), imported directly in the component
5. **Test cleanup**: Always add `afterEach` with DOM cleanup
6. **BEM naming**: Strict `.block__element--modifier` convention
7. **Commit format**: `feat: Story 3.4 — product filtering & sorting`

### Git Intelligence (Recent Commits)

```
5547e36 feat: Story 3.3 — product detail page (web SSR + mobile)
f02a71b feat: Story 3.2 — product listing page with category browsing
eb2aadf feat: Story 3.1 — Violet catalog adapter & product types
c11d552 feat: Story 2.5 — layout shell & navigation (web + mobile)
4e66f2d feat: Story 2.4 — biometric authentication for mobile
```

Pattern: single commit per story, conventional format `feat: Story X.Y — description`, Co-Authored-By trailer.

### Violet.io API — Best Practices for Product Filtering & Sorting

#### Search Request Best Practices

1. **Price values are always integer cents**: `min_price: 5000` means $50.00. Never pass floating-point dollars.
2. **Category + price filters combine** via AND logic: `{ category: "Home", min_price: 5000 }` returns Home products over $50.
3. **Availability filter**: Pass `available: true` (boolean) in the body. This is confirmed from the OpenAPI spec.
4. **Sort uses body params**: `sort_by: "minPrice"` (camelCase) + `sort_direction: "ASC"`. If body sort doesn't work, try Spring Pageable query param: `?sort=min_price,asc`.
5. **Do NOT use `beta=true`** when sorting is needed — enhanced NLP mode doesn't support `sort_by`/`sort_direction`.
6. **Default sort is relevance** — omitting sort params returns results in Violet's default relevance order.
7. **`query` field requires `?beta=true`** — our current adapter passes `query` without beta flag. This may mean text search is silently ignored. Investigate separately (not in scope for this story).

#### Client-Side Fallback Sort

If Violet's API doesn't sort correctly:
```typescript
// Sort the flattened products array client-side
const sortedProducts = [...allProducts].sort((a, b) => {
  if (sortBy === "price" && sortDirection === "ASC") return a.minPrice - b.minPrice;
  if (sortBy === "price" && sortDirection === "DESC") return b.minPrice - a.minPrice;
  return 0; // relevance = no client-side sort
});
```

This works because "Load more" keeps all products in memory (`data.pages.flatMap(...)`).

#### UX Best Practices (from UX Spec)

- Maximum 5-6 filter chips visible (AI search handles the long tail)
- Filter changes do NOT reload the page — results update in-place
- Filter state persists during the session (navigating to a product and back retains filters)
- No sidebar filter panel — horizontal chips only (per UX spec anti-pattern guidance)
- No drawer or separate filter page on mobile — same horizontal chips

### Project Structure Notes

- Filter/sort state lives in URL search params (web) — TanStack Router manages serialization/deserialization
- Mobile: state managed via React state (Expo Router search param support is limited)
- No new routes needed — only extending the existing `/products/` route
- CSS files: component-colocated (FilterChips.css, SortSelect.css) + page-level (products-page.css for toolbar layout)

### References

- [Violet.io — Search Offers](https://docs.violet.io/api-reference/catalog/offers/search-offers) — POST endpoint with filter/sort params
- [Violet.io — Pagination](https://docs.violet.io/concepts/pagination) — Spring Pageable convention, 0-based pages
- [Architecture: Query Params Convention](_bmad-output/planning-artifacts/architecture.md) — `?sortBy=price&pageSize=20` camelCase convention
- [Architecture: Query Key Convention](_bmad-output/planning-artifacts/architecture.md) — `['products', 'list', { category, page, ... }]`
- [UX Spec: Filter Chips](_bmad-output/planning-artifacts/ux-design-specification.md#filter-chips) — Chip anatomy, states, accessibility
- [UX Spec: Filter Patterns](_bmad-output/planning-artifacts/ux-design-specification.md) — Horizontal chips, multi-select, clear all, URL state
- [UX Spec: Anti-patterns](_bmad-output/planning-artifacts/ux-design-specification.md) — No sidebar filters, no 20+ facets, no drawer on mobile
- [Story 3.3](./3-3-product-detail-page.md) — Previous story learnings, test count baseline (143)
- [Story 3.2](./3-2-product-listing-page-with-category-browsing.md) — Product listing SSR pattern, CategoryChips, infinite query

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (claude-opus-4-6)

### Debug Log References

- TypeScript errors fixed: test files needed `beforeEach` import from vitest, `React` import removed (unused with modern JSX transform)
- TanStack Router type issue: `validateSearch` return type needed explicit `ProductSearchParams` interface (exported) to allow `undefined` in navigate `search` objects
- CSS architecture: filter/sort CSS colocated with components (same pattern as CategoryChips), not added to styles/index.css

### Completion Notes List

- **Task 1**: Extended `ProductQuery` with `minPrice`, `maxPrice`, `inStock`, `sortBy`, `sortDirection`. Comprehensive JSDoc documenting Violet API field naming conventions (snake_case filters vs camelCase sort_by).
- **Task 2**: Extended VioletAdapter `getProducts()` body with `min_price`, `max_price`, `available`, `sort_by`, `sort_direction`. JSDoc explains the naming asymmetry (snake_case for filter fields, camelCase for sort_by property names).
- **Task 3**: Passed all new ProductQuery fields through `getProductsFn` server function to adapter.
- **Task 4**: Extended `validateSearch` with all filter/sort params. Added explicit `ProductSearchParams` interface for type safety. Updated loader to pass all params to `productsInfiniteQueryOptions`.
- **Task 5**: Created `FilterChips` component with 6 predefined options (All, Under $50, Under $100, $100-$200, $200+, In Stock). Multi-select logic: price chips mutually exclusive, In Stock combinable.
- **Task 6**: Created `SortSelect` component with native `<select>` (3 options: Relevance, Price Low-High, Price High-Low). Encodes sortBy+sortDirection as single select value.
- **Task 7**: Integrated FilterChips + SortSelect into product listing. Toolbar row layout (count left, sort right). Empty state with "Clear filters" button. Skeleton placeholders for pending state.
- **Task 8**: Created FilterChips.css and SortSelect.css (BEM, colocated). Updated products.css with toolbar layout and clear-filters button styles.
- **Task 9**: Created mobile products/index.tsx with horizontal ScrollView filter chips and sort pills. State managed via useState (Expo Router limitation).
- **Task 10**: 11 FilterChips tests + 8 SortSelect tests = 19 new tests. All passing.
- **Task 11**: `bun run fix-all` passes (Prettier + ESLint + TypeScript). 162 total tests passing (115 web + 47 shared), up from 143 baseline.

### File List

#### Created
- `apps/web/src/components/product/FilterChips.tsx` — Price & availability filter chip component
- `apps/web/src/components/product/FilterChips.css` — Filter chip BEM styles
- `apps/web/src/components/product/SortSelect.tsx` — Sort dropdown component
- `apps/web/src/components/product/SortSelect.css` — Sort dropdown BEM styles
- `apps/web/src/components/product/__tests__/FilterChips.test.tsx` — 11 filter chip tests
- `apps/web/src/components/product/__tests__/SortSelect.test.tsx` — 8 sort select tests
- `apps/mobile/src/app/products/index.tsx` — Mobile product listing with filter/sort UI

#### Modified
- `packages/shared/src/types/product.types.ts` — Added minPrice, maxPrice, inStock, sortBy, sortDirection to ProductQuery
- `packages/shared/src/adapters/violetAdapter.ts` — Extended getProducts() body with filter/sort params
- `apps/web/src/server/getProducts.ts` — Pass all ProductQuery fields to adapter
- `apps/web/src/routes/products/index.tsx` — Extended validateSearch, added FilterChips + SortSelect + toolbar
- `apps/web/src/styles/pages/products.css` — Added toolbar layout, clear-filters button, skeleton styles

### File List (Review Updated)

#### Created
- `apps/web/src/components/product/FilterChips.tsx` — Price & availability filter chip component
- `apps/web/src/components/product/FilterChips.css` — Filter chip delta styles (extends shared chip-bar)
- `apps/web/src/components/product/SortSelect.tsx` — Sort dropdown component
- `apps/web/src/components/product/SortSelect.css` — Sort dropdown BEM styles
- `apps/web/src/components/product/__tests__/FilterChips.test.tsx` — 11 filter chip tests
- `apps/web/src/components/product/__tests__/SortSelect.test.tsx` — 8 sort select tests
- `apps/mobile/src/app/products/index.tsx` — Mobile product listing with filter/sort UI
- `apps/web/src/styles/components/chip-bar.css` — **[Review]** Shared chip-bar structural styles (DRY extraction)

#### Modified
- `packages/shared/src/types/product.types.ts` — Added minPrice, maxPrice, inStock, sortBy, sortDirection to ProductQuery
- `packages/shared/src/adapters/violetAdapter.ts` — Extended getProducts() body with filter/sort params. **[Review]** Added JSDoc warning for `category` vs `source_category_name` field name divergence
- `apps/web/src/server/getProducts.ts` — Pass all ProductQuery fields to adapter
- `apps/web/src/routes/products/index.tsx` — **[Review]** validateSearch now uses `parseNumericParam()` (NaN-safe) and runtime enum validation for sortBy/sortDirection. Dead code removed from handleSortChange
- `apps/web/src/styles/pages/products.css` — Added toolbar layout, clear-filters button, skeleton styles
- `apps/web/src/styles/index.css` — **[Review]** Added chip-bar.css import
- `apps/mobile/src/app/products/index.tsx` — **[Review]** Removed unnecessary React import, added JSDoc for placeholder sort state

### Change Log

- **2026-03-13**: Story 3.4 implemented — product filtering (price range, availability) and sorting (relevance, price asc/desc) for web and mobile. 19 new tests added. All 162 tests passing.
- **2026-03-13 (Review)**: Adversarial code review — 10 issues found (2 HIGH, 4 MEDIUM, 4 LOW). All fixed:
  - **[H1]** validateSearch NaN vulnerability → `parseNumericParam()` helper rejects NaN/Infinity
  - **[H2]** CSS duplication → extracted shared `.chip-bar` component, FilterChips.css now contains only delta styles
  - **[M1]** sortBy/sortDirection not validated at runtime → allowlist-based validation via `VALID_SORT_BY`/`VALID_SORT_DIRECTION` Sets
  - **[M2]** Dead code in handleSortChange → simplified to `isPriceSort` boolean check
  - **[M3]** VioletAdapter `category` vs `source_category_name` → JSDoc warning + @todo added
  - **[M4]** FilterChips semantic HTML → `<fieldset>` with `<legend class="sr-only">` (aligns with WAI-ARIA for filter groups)
  - **[L1]** Mobile React import removed (unnecessary with modern JSX transform)
  - **[L2]** Mobile sort state documented as placeholder with @todo
  - **[L3]** styles/index.css updated with chip-bar.css import (was missing)
  - **[L4]** Test count verified: 115 web passing
