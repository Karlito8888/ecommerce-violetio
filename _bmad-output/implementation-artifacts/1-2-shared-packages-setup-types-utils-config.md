# Story 1.2: Shared Packages Setup (Types, Utils, Config)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **developer**,
I want shared TypeScript packages for types, utilities, and configuration,
So that business logic and type definitions are shared across web and mobile without duplication.

## Acceptance Criteria

1. **AC1 - Barrel exports:** `packages/shared/` exports a barrel `index.ts` with re-exports of all types, utils, and adapters
2. **AC2 - Type files:** `packages/shared/src/types/` contains placeholder type files: `product.types.ts`, `cart.types.ts`, `order.types.ts`, `search.types.ts`, `user.types.ts`, `api.types.ts`
3. **AC3 - formatPrice utility:** `packages/shared/src/utils/formatPrice.ts` implements money formatting (integer cents → localized display string) using `Intl.NumberFormat`
4. **AC4 - Constants:** `packages/shared/src/utils/constants.ts` defines shared constants (`VIOLET_API_BASE`, TanStack Query key factories)
5. **AC5 - SupplierAdapter interface:** `packages/shared/src/adapters/supplierAdapter.ts` defines the `SupplierAdapter` interface with methods for catalog, search, cart, checkout, orders, and webhooks
6. **AC6 - Shared ESLint/TypeScript config:** `packages/config/` contains shared ESLint and TypeScript base configs (already partially exists from Story 1.1)
7. **AC7 - Cross-app imports:** Both `apps/web` and `apps/mobile` can import from `@ecommerce/shared` without build errors
8. **AC8 - ApiResponse type:** The `ApiResponse<T>` discriminated union type (`{ data: T; error: null } | { data: null; error: { code: string; message: string } }`) is defined and exported from `api.types.ts`

## Tasks / Subtasks

- [x] Task 1: Create type definition files (AC: 2, 8)
  - [x] Create `packages/shared/src/types/api.types.ts` with `ApiResponse<T>`, `ApiError`, error code pattern `DOMAIN.ACTION_FAILURE`
  - [x] Create `packages/shared/src/types/product.types.ts` with `Product`, `Offer`, `SKU`, `ProductQuery`, `PaginatedResult<T>` placeholder types
  - [x] Create `packages/shared/src/types/cart.types.ts` with `Cart`, `Bag`, `CartItem`, `CartItemInput` placeholder types
  - [x] Create `packages/shared/src/types/order.types.ts` with `Order`, `BagStatus`, `WebhookEvent`, `PaymentIntent` placeholder types
  - [x] Create `packages/shared/src/types/search.types.ts` with `SearchResult`, `SearchFilters` placeholder types
  - [x] Create `packages/shared/src/types/user.types.ts` with `User`, `AuthState` placeholder types
  - [x] Create `packages/shared/src/types/index.ts` barrel re-exporting all type files

- [x] Task 2: Create utility modules (AC: 3, 4)
  - [x] Create `packages/shared/src/utils/formatPrice.ts` — `formatPrice(cents: number, currency?: string): string` using `Intl.NumberFormat`
  - [x] Create `packages/shared/src/utils/constants.ts` — `VIOLET_API_BASE`, query key factories (`queryKeys.products`, `queryKeys.cart`, etc.)
  - [x] Create `packages/shared/src/utils/index.ts` barrel re-exporting all utils

- [x] Task 3: Create adapter interface (AC: 5)
  - [x] Create `packages/shared/src/adapters/supplierAdapter.ts` — `SupplierAdapter` interface with all methods (catalog, search, cart, checkout, orders, webhooks)
  - [x] Create `packages/shared/src/adapters/index.ts` barrel re-exporting adapter types

- [x] Task 4: Update barrel exports and verify (AC: 1, 7)
  - [x] Update `packages/shared/src/index.ts` to re-export from `./types`, `./utils`, `./adapters`
  - [x] Run `bun run typecheck` — verify zero errors in both apps
  - [x] Run `bun run lint` — verify zero lint warnings/errors
  - [x] Verify `apps/web` can import `{ ApiResponse, formatPrice }` from `@ecommerce/shared`
  - [x] Verify `apps/mobile` can import `{ Product, SupplierAdapter }` from `@ecommerce/shared`

- [x] Task 5: Update packages/config if needed (AC: 6)
  - [x] Review `packages/config/eslint.base.js` — fix `Linter.Config` → `Linter.FlatConfig` type (from Story 1.1 review follow-up L1)
  - [x] Verify `packages/config/tsconfig.base.json` is still in sync with root `tsconfig.base.json` (review follow-up M3)

## Dev Notes

### Critical Architecture Decisions

**Money as integer cents (MANDATORY):**
All money amounts are stored and transmitted as integer cents (following Violet.io convention). The ONLY place conversion to display happens is `formatPrice()`. Never store or calculate with floating-point dollars.
[Source: architecture.md#Format Patterns — Money Display Pattern]

**Discriminated union for API responses (MANDATORY):**
All Server Functions and Edge Functions return `{ data: T, error: null } | { data: null, error: { code, message } }`. Error codes follow pattern `DOMAIN.ACTION_FAILURE` (e.g., `CART.ADD_FAILED`, `VIOLET.API_ERROR`).
[Source: architecture.md#Format Patterns — API Response Format]

**SupplierAdapter pattern (CRITICAL ARCHITECTURAL FOUNDATION):**
The `SupplierAdapter` interface abstracts ALL supplier interactions. It must support Violet.io now, with firmly.ai and Google UCP planned for later. This interface is the boundary where Violet's snake_case JSON is transformed to camelCase. Never expose Violet field names beyond this boundary.
[Source: architecture.md#Adapter Pattern Contract]

**Violet snake_case → camelCase transformation rule:**
Violet API returns snake_case fields (e.g., `retail_price`, `product_id`). Transform at the adapter boundary ONLY. All internal types use camelCase. UI code must NEVER see snake_case from Violet.
[Source: architecture.md#Data Exchange Formats]

**TanStack Query key convention:**
```
['products', 'list', { category, page }]
['products', 'detail', productId]
['cart', 'current']
['orders', 'list', { status }]
['search', 'results', { query, filters }]
```
Query key factories in `constants.ts` should follow this exact pattern.
[Source: architecture.md#Communication Patterns — TanStack Query Key Convention]

**Placeholder types approach:**
Types in this story are PLACEHOLDERS. They define the shape and naming conventions but will be fleshed out in later stories (2.3 for Violet auth, 3.1 for catalog types, 4.1 for cart types). Include JSDoc comments indicating which story will implement full versions. Do NOT over-specify types — keep them minimal but correctly named and structured.

### File Naming Conventions (MUST FOLLOW)

| Element | Convention | Example |
|---|---|---|
| Type files | `camelCase.types.ts` | `product.types.ts`, `cart.types.ts` |
| Schema files | `camelCase.schema.ts` | `product.schema.ts` (future) |
| Utility files | `camelCase.ts` | `formatPrice.ts`, `constants.ts` |
| Hook files | `use` + PascalCase.ts | `useProduct.ts` (future) |
| TypeScript types/interfaces | PascalCase | `Product`, `CartItem`, `SearchResult` |
| Constants | UPPER_SNAKE_CASE | `VIOLET_API_BASE`, `MAX_CART_ITEMS` |
| Functions | camelCase | `formatPrice()`, `validateCart()` |

[Source: architecture.md#Naming Conventions]

### Target File Structure After This Story

```
packages/shared/src/
├── index.ts                    # Barrel: re-exports from types/, utils/, adapters/
├── types/
│   ├── index.ts                # Barrel: re-exports all type files
│   ├── api.types.ts            # ApiResponse<T>, ApiError
│   ├── product.types.ts        # Product, Offer, SKU, ProductQuery, PaginatedResult<T>
│   ├── cart.types.ts           # Cart, Bag, CartItem, CartItemInput
│   ├── order.types.ts          # Order, BagStatus, WebhookEvent, PaymentIntent
│   ├── search.types.ts         # SearchResult, SearchFilters
│   └── user.types.ts           # User, AuthState
├── utils/
│   ├── index.ts                # Barrel: re-exports all utils
│   ├── formatPrice.ts          # Money formatting (cents → display)
│   └── constants.ts            # VIOLET_API_BASE, query key factories
└── adapters/
    ├── index.ts                # Barrel: re-exports adapter types
    └── supplierAdapter.ts      # SupplierAdapter interface definition
```

[Source: architecture.md#Project File Structure]

### SupplierAdapter Interface Contract (from architecture.md)

```typescript
interface SupplierAdapter {
  // Catalog
  getProducts(params: ProductQuery): Promise<PaginatedResult<Product>>;
  getProduct(id: string): Promise<Product>;

  // Search (AI)
  searchProducts(query: string, filters?: SearchFilters): Promise<SearchResult>;

  // Cart
  createCart(userId: string): Promise<Cart>;
  addToCart(cartId: string, item: CartItemInput): Promise<Cart>;
  removeFromCart(cartId: string, itemId: string): Promise<Cart>;

  // Checkout
  getPaymentIntent(cartId: string): Promise<PaymentIntent>;
  submitOrder(cartId: string): Promise<Order>;

  // Orders
  getOrder(orderId: string): Promise<Order>;
  getOrders(userId: string): Promise<Order[]>;

  // Webhooks
  validateWebhook(headers: Headers, body: string): boolean;
  processWebhook(event: WebhookEvent): Promise<void>;
}
```

This is the EXACT interface from architecture.md. Do NOT modify the method signatures.
[Source: architecture.md#Adapter Pattern Contract]

### formatPrice Implementation Reference

```typescript
function formatPrice(cents: number, currency: string = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(cents / 100);
}
```

Note: Consider making the locale configurable (not hardcoded to "en-US") for future i18n support, but keep `"en-US"` as the default for now.
[Source: architecture.md#Format Patterns — Money Display Pattern]

### Previous Story Intelligence (Story 1.1)

**Key learnings from Story 1.1:**
- TanStack Start v1 uses Vite plugin (`tanstackStart()`) NOT Vinxi — `app.config.ts` is obsolete
- `bun --cwd` has CLI flag parsing issues — use `cd dir && bun run` pattern in scripts
- `routeTree.gen.ts` auto-generates on first build/dev — initial TS errors are expected
- Expo SDK 55 `tsconfig.json` extends both root and `expo/tsconfig.base` using TS5 array extends
- Packages use direct TypeScript source imports (no build step) — `"main": "./src/index.ts"` and `"exports": { ".": "./src/index.ts" }`
- Root ESLint: flat config format (eslint.config.js), `no-console: warn`, `no-debugger: error`, unused vars prefixed with `_`

**Review follow-ups from Story 1.1 (address if relevant):**
- [MEDIUM] M3 — `packages/config/tsconfig.base.json` is exact copy of root. Risk of drift. Consider making one reference the other.
- [LOW] L1 — `packages/config/eslint.base.js` uses `Linter.Config` type — should be `Linter.FlatConfig` for ESLint v9+

**Patterns established:**
- Package entry point pattern: `"main": "./src/index.ts"`, `"exports": { ".": "./src/index.ts" }`
- Direct TypeScript source imports across workspace (no compilation step for packages)
- `bun install` from root resolves everything

### Git Intelligence

Recent commits (latest first):
1. `docs: add CLAUDE.md with project conventions and architecture`
2. `chore: update dependencies to latest safe versions`
3. `refactor: replace Tailwind with Vanilla CSS + BEM, add ESLint/Prettier`
4. `feat: monorepo initialization with TanStack Start + Expo SDK 55`

Commit convention: conventional commits, `Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>`

### Testing Standards

No unit tests required for this foundation story. Verification:
- `bun run typecheck` — zero errors = pass
- `bun run lint` — zero warnings/errors = pass
- Import verification in both apps (can be done via typecheck)

Vitest is configured in `apps/web/` (from Story 1.1). Consider adding a basic `formatPrice.test.ts` as it's the only function with real logic (optional, not in AC).

### Project Structure Notes

- Alignment with architecture.md file structure: exact match for `packages/shared/` layout
- No schemas directory yet (Zod schemas come in Story 3.1+ when actual Violet API responses are handled)
- No hooks directory yet (TanStack Query hooks come in Story 3.1+)
- `packages/config/` already exists with minimal ESLint base config and tsconfig copy

### References

- [Source: architecture.md#Technology Stack]
- [Source: architecture.md#Naming Conventions — Code Naming Conventions]
- [Source: architecture.md#Structure Patterns — Project Organization]
- [Source: architecture.md#Format Patterns — API Response Format]
- [Source: architecture.md#Format Patterns — Money Display Pattern]
- [Source: architecture.md#Communication Patterns — TanStack Query Key Convention]
- [Source: architecture.md#Adapter Pattern Contract]
- [Source: architecture.md#Project File Structure — packages/shared/]
- [Source: architecture.md#Enforcement Guidelines]
- [Source: epics.md#Story 1.2: Shared Packages Setup (Types, Utils, Config)]
- [Source: implementation-artifacts/1-1-monorepo-initialization-workspace-configuration.md]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

None — clean implementation, no issues encountered.

### Completion Notes List

- Created all 6 placeholder type files under `packages/shared/src/types/` with minimal but correctly named and structured types
- `ApiResponse<T>` implemented as discriminated union; error codes follow `DOMAIN.ACTION_FAILURE` convention
- `formatPrice()` made locale-configurable (3rd param) for future i18n, defaulting to `"en-US"` as specified
- `queryKeys` factory uses `as const` return types for full TanStack Query type inference
- `SupplierAdapter` interface matches architecture.md spec exactly — no method signature modifications
- Fixed pre-existing ESLint warning in `apps/mobile/src/components/themed-view.tsx` (unused `lightColor`/`darkColor` props → prefixed with `_`)
- Fixed Story 1.1 review follow-up L1: `Linter.Config` → `Linter.FlatConfig` in `packages/config/eslint.base.js`
- Story 1.1 review follow-up M3 fixed: `packages/config/tsconfig.base.json` now extends root (was identical copy, drift risk)
- `bun run typecheck`: zero errors (web + mobile)
- `bun run lint`: zero errors, zero warnings

### Code Review Fixes (2026-03-05)

- **[H1]** `queryKeys.search.results` — replaced `Record<string, unknown>` with `SearchFilters` for type safety
- **[H2]** `VIOLET_API_BASE` — now reads `process.env.VIOLET_API_BASE` with sandbox fallback for dev
- **[M1]** `PaginatedResult<T>` — moved from `product.types.ts` to `api.types.ts` (generic infrastructure type)
- **[M2]** `formatPrice()` — added `Number.isFinite` guard and `Math.round` to enforce integer cents mandate
- **[M3]** `packages/config/tsconfig.base.json` — now extends root config instead of duplicating it

### File List

- `packages/shared/src/index.ts` (modified)
- `packages/shared/src/types/index.ts` (created)
- `packages/shared/src/types/api.types.ts` (created)
- `packages/shared/src/types/product.types.ts` (created)
- `packages/shared/src/types/cart.types.ts` (created)
- `packages/shared/src/types/order.types.ts` (created)
- `packages/shared/src/types/search.types.ts` (created)
- `packages/shared/src/types/user.types.ts` (created)
- `packages/shared/src/utils/index.ts` (created)
- `packages/shared/src/utils/formatPrice.ts` (created)
- `packages/shared/src/utils/constants.ts` (created)
- `packages/shared/src/adapters/index.ts` (created)
- `packages/shared/src/adapters/supplierAdapter.ts` (created)
- `packages/config/eslint.base.js` (modified — L1 fix)
- `apps/mobile/src/components/themed-view.tsx` (modified — pre-existing lint fix)
