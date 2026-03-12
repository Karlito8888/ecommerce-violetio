# Story 3.1: Violet Catalog Adapter & Product Types

Status: done

## Story

As a **developer**,
I want a VioletAdapter implementation for catalog operations with complete product types,
So that product data flows from Violet API through the Adapter Pattern into our UI.

## Acceptance Criteria

1. **Given** the SupplierAdapter interface from Story 1.2
   **When** the VioletAdapter is implemented
   **Then** `packages/shared/src/adapters/violetAdapter.ts` implements `getProducts()` and `getProduct()` methods

2. **And** `packages/shared/src/types/product.types.ts` defines complete types: `Product`, `Offer`, `SKU`, `ProductImage`, `ProductVariant` mapped from Violet's data model

3. **And** `packages/shared/src/schemas/product.schema.ts` defines Zod schemas for Violet API response validation

4. **And** Violet snake_case fields are transformed to camelCase at the adapter boundary (never in UI code)

5. **And** `packages/shared/src/adapters/adapterFactory.ts` returns the correct adapter by config

6. **And** the adapter uses Violet auth tokens from `violetAuth.ts` (server-side)

7. **And** API errors are mapped to structured error responses: `{ data: null, error: { code: "VIOLET.API_ERROR", message } }`

8. **And** the adapter implements request queuing with exponential backoff for Violet API rate limits (FR49, NFR31), using a configurable retry strategy (max 3 retries, 1s/2s/4s backoff)

## Tasks / Subtasks

- [x] Task 1: Expand product domain types (AC: 2)
  - [x] 1.1 Replace placeholder types in `packages/shared/src/types/product.types.ts` with complete Violet-mapped types: `Product`, `Offer`, `SKU`, `ProductImage`, `ProductVariant`, `ProductAlbum`, `VariantValue`, `OfferStatus`, `ProductType`
  - [x] 1.2 Add `VioletOfferResponse`, `VioletSkuResponse`, `VioletPaginatedResponse<T>` raw API response types to `packages/shared/src/types/violet.types.ts`
  - [x] 1.3 Export all new types from `packages/shared/src/types/index.ts`

- [x] Task 2: Create Zod validation schemas (AC: 3)
  - [x] 2.1 Install `zod` in `packages/shared` (if not already present)
  - [x] 2.2 Create `packages/shared/src/schemas/product.schema.ts` with schemas: `violetOfferSchema`, `violetSkuSchema`, `violetPaginatedResponseSchema`, `violetMediaSchema`
  - [x] 2.3 Schemas must validate ALL fields from Violet API responses (snake_case) before transformation
  - [x] 2.4 Create barrel export `packages/shared/src/schemas/index.ts`

- [x] Task 3: Implement VioletAdapter catalog methods (AC: 1, 4, 6, 7, 8)
  - [x] 3.1 Create `packages/shared/src/adapters/violetAdapter.ts` implementing `SupplierAdapter` interface
  - [x] 3.2 Implement `getProducts(params: ProductQuery)`: calls `POST /catalog/offers/search` with pagination, validates response with Zod, transforms snake_case → camelCase
  - [x] 3.3 Implement `getProduct(id: string)`: calls `GET /catalog/offers/{offer_id}`, validates and transforms
  - [x] 3.4 Implement private `transformOffer(raw: VioletOfferResponse): Product` method for snake_case → camelCase mapping
  - [x] 3.5 Implement private `transformSku(raw: VioletSkuResponse): SKU` for SKU transformation
  - [x] 3.6 Use `VioletTokenManager.getAuthHeaders()` for all API calls
  - [x] 3.7 Map all Violet API errors to `{ data: null, error: { code: "VIOLET.*", message } }`
  - [x] 3.8 Implement exponential backoff retry logic: max 3 retries, delays 1s/2s/4s, triggered on HTTP 429
  - [x] 3.9 Stub remaining SupplierAdapter methods (cart, checkout, orders, webhooks, search) with `throw new Error("Not implemented — Story X.Y")` placeholders

- [x] Task 4: Create adapter factory (AC: 5)
  - [x] 4.1 Create `packages/shared/src/adapters/adapterFactory.ts` with `createSupplierAdapter(config)` factory function
  - [x] 4.2 Factory returns `VioletAdapter` when config supplier is "violet" (only supported supplier for now)
  - [x] 4.3 Throw descriptive error for unsupported supplier values
  - [x] 4.4 Update `packages/shared/src/adapters/index.ts` barrel export

- [x] Task 5: Tests (AC: 1-8)
  - [x] 5.1 Create `packages/shared/src/adapters/__tests__/violetAdapter.test.ts`
  - [x] 5.2 Test `transformOffer` correctly maps all Violet snake_case fields to camelCase Product
  - [x] 5.3 Test `transformSku` correctly maps SKU fields
  - [x] 5.4 Test Zod schema validation rejects malformed Violet responses
  - [x] 5.5 Test error mapping: 429 → VIOLET.RATE_LIMITED, 401 → VIOLET.AUTH_FAILED, 500 → VIOLET.API_ERROR
  - [x] 5.6 Test exponential backoff: verify retry delays and max retry limit
  - [x] 5.7 Test `adapterFactory` returns VioletAdapter for "violet" config
  - [x] 5.8 Test `adapterFactory` throws for unknown supplier

- [x] Task 6: Quality checks (AC: 1-8)
  - [x] 6.1 Run `bun run fix-all` (Prettier + ESLint + TypeScript check)
  - [x] 6.2 Run `bun --cwd=apps/web run test` to ensure no regressions

## Dev Notes

### Violet API — Critical Knowledge from Official Docs

**Violet uses "Offer" = Product.** An Offer is a merchant's listing containing SKUs (purchasable variants). Our internal `Product` type maps from Violet's `Offer`.

#### Key Endpoints for This Story

| Endpoint | Method | Path | Purpose |
|---|---|---|---|
| Search Offers | POST | `/catalog/offers/search` | Paginated search with filters → `getProducts()` |
| Get Offer by ID | GET | `/catalog/offers/{offer_id}` | Single offer with full details → `getProduct()` |

#### Required Headers (Every Request)

```
X-Violet-App-Id: {appId}
X-Violet-App-Secret: {appSecret}
X-Violet-Token: {jwt}
Content-Type: application/json
```

Already handled by `VioletTokenManager.getAuthHeaders()` in `packages/shared/src/clients/violetAuth.ts`.

#### Violet Offer Response Shape (snake_case — what the API returns)

```typescript
// This is what Violet sends — NEVER expose these field names to UI code
{
  id: number,                    // Violet's unique ID (store as string internally)
  name: string,
  description: string,
  html_description: string | null,
  min_price: number,             // Lowest SKU price in CENTS
  max_price: number,             // Highest SKU price in CENTS
  currency: string,              // ISO 4217 (e.g. "USD")
  available: boolean,
  visible: boolean,
  status: "AVAILABLE" | "UNAVAILABLE" | "DISABLED_AVAILABLE" | "DISABLED_UNAVAILABLE" | "ARCHIVED" | "FOR_DELETION",
  publishing_status: "PUBLISHED" | "NOT_PUBLISHED",
  source: string,                // "SHOPIFY", "AMAZON", etc.
  seller: string,                // Store name
  vendor: string,                // Brand/vendor
  type: "PHYSICAL" | "DIGITAL",
  external_url: string,
  merchant_id: number,
  product_id: string,
  commission_rate: number,
  tags: string[],
  date_created: string,          // ISO 8601
  date_last_modified: string,
  variants: VioletVariant[],
  skus: VioletSku[],
  albums: VioletAlbum[],
}
```

#### Violet SKU Response Shape

```typescript
{
  id: number,
  offer_id: number,
  merchant_id: number,
  name: string,
  in_stock: boolean,
  qty_available: number,
  sale_price: number,            // Current price in CENTS
  retail_price: number,          // Original/list price in CENTS
  currency: string,
  taxable: boolean,
  type: "PHYSICAL" | "DIGITAL" | "VIRTUAL" | "BUNDLED",
  status: string,
  variant_values: [{ variant: string, value: string }],
  sku_dimensions: { weight: number, type: string } | null,
  albums: VioletAlbum[],
  date_created: string,
  date_last_modified: string,
}
```

#### Violet Pagination Response Wrapper

```typescript
{
  content: T[],
  total_elements: number,
  total_pages: number,
  number: number,                // Current page (0-based from Violet!)
  size: number,
  number_of_elements: number,
  first: boolean,
  last: boolean,
  empty: boolean,
}
```

**CRITICAL:** Violet uses 0-based page numbers. Our internal `PaginatedResult` uses 1-based. Transform at adapter boundary: `page = violetResponse.number + 1`.

#### Violet Media / Album Shape

```typescript
{
  id: number,
  type: "OFFER" | "SKU",
  name: string,
  media: [{
    id: number,
    url: string,                 // CDN URL — use this for display
    source_url: string,
    type: "IMAGE",
    display_order: number,
    primary: boolean,
  }],
  primary_media: { url: string, ... },
}
```

#### Rate Limiting

- HTTP 429 on rate limit exceeded
- Per-merchant limits (proxied from underlying platforms like Shopify)
- No specific numeric limits documented
- **Implementation:** Exponential backoff on 429: wait 1s → 2s → 4s, max 3 retries, then return `VIOLET.RATE_LIMITED` error

### Architecture Compliance

#### Data Transformation Rules (CRITICAL)

```typescript
// ✅ CORRECT: Transform at adapter boundary
function transformOffer(raw: VioletOfferResponse): Product {
  return {
    id: String(raw.id),          // numeric → string
    name: raw.name,
    description: raw.description,
    retailPrice: raw.min_price,  // snake_case → camelCase
    // ...
  };
}

// ❌ WRONG: Violet field names leaking into UI
<span>{product.retail_price}</span>

// ❌ WRONG: Manual cents division in UI
<span>${product.price / 100}</span>

// ✅ CORRECT: Use formatPrice utility
<span>{formatPrice(product.retailPrice)}</span>
```

#### Error Response Format

All adapter methods MUST return `ApiResponse<T>`:

```typescript
// Success
{ data: transformedProduct, error: null }

// Error
{ data: null, error: { code: "VIOLET.API_ERROR", message: "..." } }
```

Error code conventions:
- `VIOLET.API_ERROR` — generic API failure
- `VIOLET.RATE_LIMITED` — HTTP 429
- `VIOLET.AUTH_FAILED` — HTTP 401/403
- `VIOLET.NOT_FOUND` — HTTP 404
- `VIOLET.NETWORK_ERROR` — fetch failure
- `VIOLET.VALIDATION_ERROR` — Zod parse failure

#### Server-Side Only

The VioletAdapter is **server-side only** (never imported in browser/mobile). It runs in:
- TanStack Server Functions (web) — for `getProduct`, `getProducts`
- Supabase Edge Functions (cross-platform) — for webhook processing, search enrichment

The UI accesses products through TanStack Query hooks (`useProducts`, `useProduct`) that call Server Functions.

### Existing Code to Reuse (DO NOT REINVENT)

| What | Where | How to Use |
|---|---|---|
| `SupplierAdapter` interface | `packages/shared/src/adapters/supplierAdapter.ts` | Implement this interface |
| `VioletTokenManager` | `packages/shared/src/clients/violetAuth.ts` | Call `getAuthHeaders()` for every Violet API request |
| `ApiResponse<T>` type | `packages/shared/src/types/api.types.ts` | Return type for all adapter methods |
| `PaginatedResult<T>` type | `packages/shared/src/types/api.types.ts` | Return type for `getProducts()` |
| `ProductQuery` type | `packages/shared/src/types/product.types.ts` | Input params for `getProducts()` |
| `VIOLET_API_BASE` constant | `packages/shared/src/utils/constants.ts` | Base URL for API calls |
| `queryKeys.products` | `packages/shared/src/utils/constants.ts` | TanStack Query keys (used by future hooks, not adapter) |
| `formatPrice()` | `packages/shared/src/utils/formatPrice.ts` | Money display (used by UI, not adapter) |

### File Structure

#### Files to CREATE

```
packages/shared/src/adapters/violetAdapter.ts       # VioletAdapter class implementing SupplierAdapter
packages/shared/src/adapters/adapterFactory.ts       # createSupplierAdapter() factory function
packages/shared/src/schemas/product.schema.ts        # Zod schemas for Violet API response validation
packages/shared/src/schemas/index.ts                 # Schemas barrel export
packages/shared/src/adapters/__tests__/violetAdapter.test.ts  # Unit tests
```

#### Files to MODIFY

```
packages/shared/src/types/product.types.ts           # Replace placeholders with complete types
packages/shared/src/types/violet.types.ts            # Add Violet raw API response types
packages/shared/src/types/index.ts                   # Export new types
packages/shared/src/adapters/index.ts                # Export VioletAdapter, adapterFactory
packages/shared/src/index.ts                         # Export schemas barrel (if not auto-covered)
packages/shared/package.json                         # Add zod dependency
```

#### DO NOT TOUCH

```
packages/shared/src/clients/violetAuth.ts            # Auth already works — just import and call
packages/shared/src/utils/constants.ts               # VIOLET_API_BASE already correct
packages/shared/src/utils/formatPrice.ts             # Already complete
packages/shared/src/types/api.types.ts               # ApiResponse, PaginatedResult already correct
apps/web/                                            # No web changes in this story
apps/mobile/                                         # No mobile changes in this story
supabase/                                            # No database/edge function changes
```

### Library / Framework Requirements

| Library | Version | Purpose | Notes |
|---------|---------|---------|-------|
| `zod` | latest stable (^3.x) | Runtime validation of Violet API responses | New dependency for `packages/shared` |

No other new dependencies required. All other libraries are already installed.

### Testing Requirements

1. **Unit tests** in `packages/shared/src/adapters/__tests__/violetAdapter.test.ts`:
   - Mock `fetch` to simulate Violet API responses
   - Test transformation correctness (snake_case → camelCase)
   - Test Zod validation rejects bad data
   - Test error code mapping (429, 401, 404, 500, network errors)
   - Test exponential backoff retry logic (mock timers)
   - Test adapter factory returns correct adapter

2. **Quality checks**:
   - `bun run fix-all` must pass
   - `bun --cwd=apps/web run test` must not regress

3. **Manual verification**:
   - Import VioletAdapter and call with sandbox credentials (optional, for dev testing)

### Previous Story Intelligence (Story 2.5)

From Story 2.5 (latest implemented):

1. **Commit format**: `feat: Story X.Y — description`. Follow exactly.
2. **CI constraint**: `bun run fix-all` runs Prettier + ESLint + TypeScript check. Code must pass.
3. **Code review finding**: Hardcoded values flagged as HIGH severity. Use constants/tokens for all config values.
4. **Package imports**: `@ecommerce/shared` barrel exports work. Use `import type { ... } from "@ecommerce/shared"` in consuming code.
5. **Profile screen location issue**: Root-level vs `(tabs)/` placement caused confusion. Follow established file patterns exactly.
6. **Debug log**: TypeScript errors with TanStack Router required widening types. Expect similar type-level challenges with Zod schema inference.

### Git Intelligence (Recent Commits)

```
c11d552 feat: Story 2.5 — layout shell & navigation (web + mobile)
4e66f2d feat: Story 2.4 — biometric authentication for mobile (Face ID / Fingerprint)
d5d16ed feat: Story 2.3 — Violet API token lifecycle management (server-side)
464f42f feat: Story 2.2 — user registration & login with email verification
982e101 fix: CI build failure — conditional React aliases + skip integration tests
```

Patterns: single commit per story, conventional format, Co-Authored-By trailer.

### References

- [Violet.io Official API Docs — Offers](https://docs.violet.io/api-reference/catalog/offers)
- [Violet.io — Search Offers](https://docs.violet.io/api-reference/catalog/offers/search-offers)
- [Violet.io — SKUs](https://docs.violet.io/prism/catalog/skus)
- [Violet.io — Pagination](https://docs.violet.io/concepts/pagination)
- [Violet.io — Rate Limits](https://docs.violet.io/concepts/rate-limits)
- [Violet.io — Authentication](https://docs.violet.io/concepts/overview/making-authenticated-requests)
- [Architecture §Adapter Pattern](../_bmad-output/planning-artifacts/architecture.md) — SupplierAdapter interface, data transformation rules
- [Architecture §API Patterns](../_bmad-output/planning-artifacts/architecture.md) — Error response format, data exchange conventions
- [Architecture §Shared Package](../_bmad-output/planning-artifacts/architecture.md) — Package structure, type system pipeline
- [Epics §Epic 3](../_bmad-output/planning-artifacts/epics.md) — Story requirements, cross-story dependencies
- [Story 2.3 — Violet Auth](./2-3-violet-api-token-management.md) — VioletTokenManager implementation
- [Story 2.5 — Layout Shell](./2-5-layout-shell-navigation.md) — Latest implementation patterns and learnings

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- Hookify plugin cache corruption blocked all Write/Bash/Edit operations mid-implementation. Resolved by user reinstalling the plugin.

### Completion Notes List

- **Task 1:** Replaced placeholder `Product`, `Offer`, `SKU` types with complete Violet-mapped types including `ProductAlbum`, `ProductImage`, `ProductVariant`, `VariantValue`, `OfferStatus`, `ProductType`, `SkuType`, `SkuDimensions`, `PublishingStatus`, `ProductMedia`. Added all raw Violet API response types (`VioletOfferResponse`, `VioletSkuResponse`, `VioletPaginatedResponse<T>`, `VioletAlbumResponse`, `VioletMediaResponse`, etc.) to `violet.types.ts`. All exported from barrel.
- **Task 2:** Installed `zod@4.3.6` (v4). Created comprehensive Zod schemas validating all Violet snake_case fields before transformation. Generic `violetPaginatedResponseSchema()` factory for typed pagination. Pre-built `violetPaginatedOffersSchema` for offer search.
- **Task 3:** Implemented `VioletAdapter` class: `getProducts()` (POST `/catalog/offers/search` with 0→1 pagination transform), `getProduct()` (GET `/catalog/offers/{id}`). Private `transformOffer`, `transformSku`, `transformAlbum`, `extractImages`, `extractThumbnail` methods. Exponential backoff retry (1s/2s/4s, max 3) on HTTP 429 and network errors. All error codes mapped per spec. Auth via `VioletTokenManager.getAuthHeaders()`. All unimplemented methods throw with future story references.
- **Task 4:** Created `createSupplierAdapter()` factory with `AdapterConfig` interface. Returns `VioletAdapter` for "violet" supplier. Descriptive errors for missing config or unsupported supplier.
- **Task 5:** 23 unit tests covering: transformation correctness (offer + SKU snake→camel), null handling, numeric→string ID conversion, 0→1 pagination, Zod validation rejection, error code mapping (429/401/403/404/500/network), exponential backoff with fake timers, auth header propagation, adapter factory (positive + negative cases).
- **Task 6:** `bun run fix-all` passes (Prettier + ESLint + TypeScript). 56 web tests pass with 0 regressions. 31 shared tests pass (23 new + 8 existing).

### Senior Developer Review (AI)

**Reviewer:** Charles (via Claude Opus 4.6 adversarial review)
**Date:** 2026-03-12
**Outcome:** Changes Requested → Fixed

**Findings (12 total: 3 CRITICAL, 6 MEDIUM, 3 LOW):**

All findings were fixed in-place with JSDoc documentation explaining each decision:

| ID | Severity | Description | Fix Applied |
|----|----------|-------------|-------------|
| C1 | CRITICAL | Zod schemas too strict — Violet excludes null fields from responses, causing VALIDATION_ERROR on valid products | All optional fields use `.optional().default(...)` |
| C2 | CRITICAL | Pagination 0-based vs 1-based ambiguity (docs say 1, Spring Boot uses 0) | Documented ambiguity in JSDoc, kept 0-based (verified against sandbox) |
| C3 | CRITICAL | SKU variant_values field name: docs say `{name,value}`, code used `{variant,value}` | Accept BOTH via Zod `.refine()` + adapter normalizes to `{variant,value}` |
| M1 | MEDIUM | No fetch timeout — requests could hang indefinitely | Added AbortController with 30s timeout per request |
| M2 | MEDIUM | Content-Type sent on GET requests (no body) | Conditional: only set Content-Type when `init.body` is present |
| M3 | MEDIUM | `thumbnailUrl` returned `""` instead of `null` — `<img src="">` issues | Returns `null`, updated Product type to `string \| null` |
| M4 | MEDIUM | Search beta/extended params not used | Documented as future consideration in JSDoc |
| M5 | MEDIUM | Non-null assertion `!` on discriminated union | Removed `!`, TypeScript narrows correctly |
| M6 | MEDIUM | OfferStatus enum missing `"DISABLED"` from official docs | Added `"DISABLED"` to union, Zod uses `z.string()` as catch-all |
| L1 | LOW | JSON parse errors on 200 OK triggered retries | Separate try/catch for `res.json()`, no retry on parse failure |
| L2 | LOW | Tests use `vi.stubGlobal` (acceptable for MVP) | Documented, not changed |
| L3 | LOW | No test for search POST body params | Added test verifying query/category/merchantId in body |

**Tests after review:** 38 shared (30 adapter + 8 biometric) + 56 web = 94 total, 0 regressions.

### Change Log

- 2026-03-12: Story 3.1 implementation complete. All 6 tasks done, 23 tests added, all ACs satisfied.
- 2026-03-12: Code review completed. 12 findings (3C/6M/3L) all fixed. 7 new tests added (30 total adapter tests). Violet.io official docs cross-referenced. JSDoc documentation added to all files.

### File List

#### Created
- `packages/shared/src/adapters/violetAdapter.ts`
- `packages/shared/src/adapters/adapterFactory.ts`
- `packages/shared/src/schemas/product.schema.ts`
- `packages/shared/src/schemas/index.ts`
- `packages/shared/src/adapters/__tests__/violetAdapter.test.ts`

#### Modified
- `packages/shared/src/types/product.types.ts`
- `packages/shared/src/types/violet.types.ts`
- `packages/shared/src/types/index.ts`
- `packages/shared/src/adapters/index.ts`
- `packages/shared/src/index.ts`
- `packages/shared/package.json`
- `bun.lock`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `_bmad-output/implementation-artifacts/3-1-violet-catalog-adapter-product-types.md`
