# Story 4.1: Cart Creation & Item Management (Web + Mobile)

Status: done

## Quick Reference — Files to Create/Update

| Action | File | Notes |
|--------|------|-------|
| CREATE | `supabase/migrations/20260314000000_carts.sql` | carts + cart_items tables |
| UPDATE | `packages/shared/src/types/cart.types.ts` | enhance placeholder types |
| CREATE | `packages/shared/src/schemas/cart.schema.ts` | Zod validation |
| CREATE | `packages/shared/src/hooks/useCart.ts` | TanStack Query hooks |
| UPDATE | `packages/shared/src/adapters/supplierAdapter.ts` | add updateCartItem, getCart |
| UPDATE | `packages/shared/src/adapters/violetAdapter.ts` | implement cart methods |
| UPDATE | `packages/shared/src/types/index.ts` | re-export new types |
| UPDATE | `packages/shared/src/schemas/index.ts` | export cart schema |
| UPDATE | `packages/shared/src/hooks/index.ts` | export useCart |
| CREATE | `apps/web/src/server/cartActions.ts` | Server Functions for cart CRUD |
| CREATE | `apps/web/src/contexts/CartContext.tsx` | drawer state + cartId management |
| CREATE | `apps/web/src/features/cart/CartDrawer.tsx` | slide-in panel |
| CREATE | `apps/web/src/features/cart/CartItem.tsx` | item row component |
| CREATE | `apps/web/src/features/cart/CartEmpty.tsx` | empty state |
| CREATE | `apps/web/src/features/cart/CartBag.tsx` | merchant bag wrapper |
| CREATE | `apps/web/src/routes/cart/index.tsx` | full cart page (CSR) |
| CREATE | `apps/web/src/styles/components/cart-drawer.css` | BEM styles |
| UPDATE | `apps/web/src/styles/index.css` | add cart-drawer.css import |
| UPDATE | `apps/web/src/routes/__root.tsx` | wrap with CartProvider, add cart badge |
| UPDATE | `apps/mobile/src/app/cart.tsx` | replace placeholder with real cart screen |
| CREATE | `supabase/functions/cart/index.ts` | Edge Function for mobile |

---

## Story

As a **visitor**,
I want to add products from multiple merchants to a single unified cart and manage items,
so that I can shop across merchants seamlessly.

## Acceptance Criteria

1. **Given** a visitor on a product detail page (web or mobile)
   **When** they tap/click "Add to Cart"
   **Then** a Violet cart is created via `POST /checkout/cart` if none exists (using channel `app_id` + auth token)

2. **And** the SKU is added via `POST /checkout/cart/{id}/skus` with `sku_id`, `quantity`, `app_id`

3. **And** the cart correctly groups items into Bags (one per merchant) — Violet-managed automatically, not our logic

4. **And** the cart state is stored in Supabase (`carts` table) with `violet_cart_id`, `user_id` (nullable for guests), `session_id`

5. **And** `supabase/migrations/20260314000000_carts.sql` creates `carts` + `cart_items` tables with RLS policies

6. **And** anonymous users get a Supabase anonymous session (FR14) and their cart is linked to `session_id`

7. **And** web: cart count badge updates in the header via TanStack Query invalidation

8. **And** web: a cart drawer slides in from the right (250ms ease) when an item is added to cart, showing the added item, bag summary, and a "Proceed to Checkout" CTA; the drawer closes on overlay click, Escape key, or "Continue Shopping" link

9. **And** mobile: cart count badge updates on the Cart tab icon

10. **And** visitors can update quantity via `PUT /checkout/cart/{id}/skus/{sku_id}` (min: 1)

11. **And** visitors can remove items via `DELETE /checkout/cart/{id}/skus/{sku_id}`

12. **And** if the API returns 200 with `errors` array, errors are displayed per-bag (e.g., "Item X is out of stock")

13. **And** all cart API calls go through Server Functions (web) / Edge Functions (mobile) — Violet token never exposed to client

14. **And** `packages/shared/src/hooks/useCart.ts` provides shared cart mutation hooks with optimistic updates

## Tasks / Subtasks

- [x] Task 1: Supabase migration — carts & cart_items tables (AC: #4, #5)
  - [x]Create `supabase/migrations/20260314000000_carts.sql` with `carts` and `cart_items` tables
  - [x]Add RLS policies: cart owner (`auth.uid() = user_id`) + guest session (`session_id` match)
  - [x]Add `violet_cart_id` TEXT NOT NULL UNIQUE, `user_id` UUID nullable (FK → auth.users), `session_id` TEXT nullable

- [x] Task 2: Extend cart types in shared package (AC: #1–#3, #10–#11)
  - [x]Enhance `packages/shared/src/types/cart.types.ts` — add `sessionId`, `violetCartId`, `status` fields to `Cart`; add `merchantName` to `Bag`; add `tax`, `shippingTotal` fields to `Bag`
  - [x]Create `packages/shared/src/schemas/cart.schema.ts` — Zod validation for Violet cart API responses
  - [x]Export new types/schemas from `packages/shared/src/types/index.ts` and `packages/shared/src/schemas/index.ts`

- [x] Task 3: Implement cart methods in VioletAdapter (AC: #1, #2, #10, #11, #12)
  - [x]Implement `createCart()` → `POST /checkout/cart` with `channel_id: app_id`
  - [x]Implement `addToCart()` → `POST /checkout/cart/{id}/skus` with `sku_id`, `quantity`, `app_id`
  - [x]Implement `updateCartItem(cartId, skuId, quantity)` → `PUT /checkout/cart/{id}/skus/{sku_id}` — add to SupplierAdapter interface
  - [x]Implement `removeFromCart(cartId, skuId)` → `DELETE /checkout/cart/{id}/skus/{sku_id}`
  - [x]Implement `getCart(cartId)` → `GET /checkout/cart/{id}` — add to SupplierAdapter interface
  - [x]Parse 200-with-errors: check `response.errors` array even on success, return structured bag-level errors
  - [x]Map Violet snake_case → camelCase at adapter boundary (never expose `sku_id`, `merchant_id` raw to UI)

- [x] Task 4: Web — CartContext + cartId persistence (AC: #7, #8)
  - [x]Create `apps/web/src/contexts/CartContext.tsx` with `CartProvider` and `useCartContext()`
  - [x]Context state: `{ cartId: string | null, isDrawerOpen: boolean, openDrawer(), closeDrawer(), setCartId() }`
  - [x]`cartId` persists via HttpOnly cookie `violet_cart_id` — set by Server Function response header, read server-side on hydration
  - [x]Wrap `apps/web/src/routes/__root.tsx` with `<CartProvider>` so drawer is accessible app-wide

- [x] Task 5: Web — Server Functions for cart CRUD (AC: #1, #2, #7, #10, #11, #13)
  - [x]Create `apps/web/src/server/cartActions.ts` with `createCartFn`, `addToCartFn`, `updateCartItemFn`, `removeFromCartFn`, `getCartFn`
  - [x]Each Server Function: call `getAdapter()`, persist cart to Supabase, return typed `ApiResponse<Cart>`
  - [x]`createCartFn`: after Violet cart creation, set cookie `violet_cart_id={violetCartId}; HttpOnly; SameSite=Lax; Path=/`
  - [x]Use `createServerFn({ method: "POST" })` for mutations, `"GET"` for queries

- [x] Task 6: Shared hooks — useCart.ts (AC: #7, #9, #12, #14)
  - [x]Create `packages/shared/src/hooks/useCart.ts` with:
    - `useCartQuery(cartId)` — query key `['cart', 'detail', cartId]`, staleTime: 0
    - `useAddToCart()` — mutation with optimistic update (add item to cache, rollback on error)
    - `useUpdateCartItem()` — mutation with optimistic update
    - `useRemoveFromCart()` — mutation with optimistic update
  - [x]Export from `packages/shared/src/hooks/index.ts`

- [x] Task 7: Web — Cart Drawer component (AC: #8)
  - [x]Create `apps/web/src/features/cart/CartDrawer.tsx` — uses `useCartContext()` for open/close state
  - [x]`role="dialog"`, `aria-label="Shopping bag"`, focus trap, Escape key handler
  - [x]Closes on: ✕ button, overlay click, Escape key, "Continue Shopping" link
  - [x]Shows: items grouped by merchant (Bag), quantity controls, remove button, subtotal, "Proceed to Checkout" CTA
  - [x]Item removed: 150ms fade out; price updates via `aria-live="polite"`
  - [x]Create `apps/web/src/styles/components/cart-drawer.css` with BEM classes (see CSS section)
  - [x]Add `@import './components/cart-drawer.css'` to `apps/web/src/styles/index.css`

- [x] Task 8: Web — Add to Cart button on Product Detail Page (AC: #1, #2, #7, #8)
  - [x]Update product detail component — add "Add to Cart" button with variant/SKU selection
  - [x]Button state: default → loading (spinner) → "✓ Added!" (1.5s) → revert; disabled during processing
  - [x]On success: call `openDrawer()` from `useCartContext()` + invalidate `['cart', 'detail']` query

- [x] Task 9: Mobile — Cart screen (AC: #1, #2, #9)
  - [x]UPDATE (replace placeholder) `apps/mobile/src/app/cart.tsx` — ScrollView with merchant-grouped items
  - [x]Add "Add to Cart" action on `apps/mobile/src/app/products/[productId].tsx`
  - [x]Cart tab badge: derive count from `useCartQuery` total item count
  - [x]Quantity adjustment with inline +/- buttons; swipe-to-remove with undo toast

- [x] Task 10: Mobile — Edge Function for cart (AC: #13)
  - [x]Create `supabase/functions/cart/index.ts` to proxy Violet cart API calls
  - [x]Use `getVioletHeaders()` from `supabase/functions/_shared/violetAuth.ts` — same auth pattern as `handle-webhook`
  - [x]Routes: POST (create), POST `/{id}/skus` (add), PUT `/{id}/skus/{skuId}` (update), DELETE `/{id}/skus/{skuId}` (remove), GET `/{id}` (fetch)
  - [x]Validate user JWT with `supabaseAdmin` before calling Violet; store cart in Supabase after each mutation

## Dev Notes

### Critical Architecture Constraints

- **NEVER expose Violet token to client**: All Violet cart API calls MUST go through `apps/web/src/server/cartActions.ts` (Server Functions) or `supabase/functions/cart/` (Edge Functions). The `getAdapter()` singleton is the correct pattern — see `apps/web/src/server/violetAdapter.ts`.

- **Violet cart model**: One `Cart` contains multiple `Bags` (one per merchant). Violet manages bag grouping automatically — we submit `sku_id`s and Violet assigns items to the correct merchant Bag. Never manually assign items to bags.

- **200-with-errors pattern**: Violet returns HTTP 200 even when some items have errors. Always check `response.errors` array on ALL cart API responses. Display errors per-bag, not as global alerts.

- **staleTime: 0 for cart**: Cart queries always use `staleTime: 0` (always fresh). Per `architecture.md#Caching` — intentional to prevent stale state.

- **Cart page is CSR**: Use `createFileRoute` with no `loader` for the cart route. The route component renders client-side only. Existing routes (`products/index.tsx`) use `createFileRoute` — follow the same pattern, simply omit the `loader`.

### C1 — Cart ID Persistence (Critical)

The `violet_cart_id` must persist across page loads and server requests. Pattern:

1. **Web**: `createCartFn` Server Function sets an HttpOnly cookie after Violet cart creation:
   ```typescript
   // In cartActions.ts handler:
   setCookie(event, 'violet_cart_id', String(violetCartId), {
     httpOnly: true,
     sameSite: 'lax',
     path: '/',
     maxAge: 60 * 60 * 24 * 30, // 30 days
   });
   ```
   On app hydration, the root loader reads `violet_cart_id` cookie and passes it to `CartProvider` as initial state.

2. **Mobile**: Store `violet_cart_id` in `AsyncStorage` (Expo) after cart creation. Read it before any cart API call.

3. **Supabase row lookup**: After reading the cookie, look up the `carts` table row by `violet_cart_id` to get the Supabase cart UUID. Use the Supabase UUID for all Supabase operations, the `violet_cart_id` integer for Violet API calls.

### C2 — CartContext (Critical — prevents duplicate state management)

Create `apps/web/src/contexts/CartContext.tsx`:

```typescript
interface CartContextValue {
  cartId: string | null;        // Supabase cart UUID
  violetCartId: string | null;  // Violet cart integer ID (as string)
  isDrawerOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
  setCart: (cartId: string, violetCartId: string) => void;
}
```

- **Do NOT use Zustand or any external state library** — React Context is the established pattern in this codebase (see `useAuthSession.ts`)
- Mount `<CartDrawer />` inside `CartProvider` at the `__root.tsx` level so it's always available
- The drawer open/close state lives only in this context — never in component-local state

### Violet API Endpoints

Reference: `https://sandbox-api.violet.io/v1` (sandbox) — use env var `VIOLET_API_BASE`.

| Action | Method | Endpoint | Body |
|--------|--------|----------|------|
| Create cart | POST | `/checkout/cart` | `{ "channel_id": app_id, "currency": "USD" }` |
| Add SKU | POST | `/checkout/cart/{cartId}/skus` | `{ "sku_id": skuId, "quantity": qty, "app_id": appId }` |
| Update SKU qty | PUT | `/checkout/cart/{cartId}/skus/{skuId}` | `{ "quantity": qty }` |
| Remove SKU | DELETE | `/checkout/cart/{cartId}/skus/{skuId}` | — |
| Get cart | GET | `/checkout/cart/{cartId}` | — |

**Auth headers for Server Functions (web)** — handled by `fetchWithRetry` in `violetAdapter.ts`:
```
X-Violet-App-Id: {VIOLET_APP_ID}
X-Violet-App-Secret: {VIOLET_APP_SECRET}
Authorization: Bearer {violet_token}
Content-Type: application/json
```

**Auth headers for Edge Functions (mobile)** — use `getVioletHeaders()`:
```typescript
import { getVioletHeaders } from '../_shared/violetAuth.ts';
// Returns: { 'X-Violet-Token', 'X-Violet-App-Id', 'X-Violet-App-Secret' }
// Note: Edge Functions use X-Violet-Token header, not Authorization: Bearer
```

**Violet response shape (cart)**:
```typescript
// Violet returns snake_case — adapter transforms to camelCase before returning
{
  id: number,           // our violet_cart_id
  channel_id: number,   // app_id
  bags: [
    {
      id: number,
      merchant_id: number,
      merchant_name: string,
      skus: [
        {
          id: number,       // sku_id within this bag
          sku_id: number,   // external sku_id
          quantity: number,
          price: number,    // in cents
        }
      ],
      subtotal: number,   // in cents
      tax: number,        // in cents
      shipping_total: number,
    }
  ],
  errors: []  // ← CRITICAL: check this even on HTTP 200
}
```

### Existing Patterns to Follow

**Adapter pattern** (from `packages/shared/src/adapters/violetAdapter.ts`):
- Use `this.fetchWithRetry()` for all Violet API calls (handles rate limiting, timeout, retries)
- Use `mapHttpError()` for error code standardization
- Transform snake_case → camelCase AT the adapter boundary
- Return `ApiResponse<T>`: `{ data: T, error: null }` or `{ data: null, error: { code, message } }`

**Server Function pattern** (from `apps/web/src/server/getProduct.ts`):
```typescript
export const addToCartFn = createServerFn({ method: "POST" })
  .inputValidator((input: CartItemInput & { cartId?: string }) => input)
  .handler(async ({ data }): Promise<ApiResponse<Cart>> => {
    const adapter = getAdapter();
    // ... call adapter, persist to Supabase
  });
```

**Edge Function pattern** (from `supabase/functions/handle-webhook/index.ts`):
```typescript
import { getVioletHeaders } from '../_shared/violetAuth.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { createSupabaseAdmin } from '../_shared/supabaseAdmin.ts';

// Use Deno.env.get() for env vars (NOT process.env)
// Use getVioletHeaders() for Violet auth — replaces the web pattern of getAdapter()
```

**Singleton adapter** — reuse existing `getAdapter()` from `apps/web/src/server/violetAdapter.ts`. **Do NOT create a new adapter instance in any web Server Function**.

### Supabase Schema (Migration)

Migration file: `supabase/migrations/20260314000000_carts.sql`

```sql
CREATE TABLE IF NOT EXISTS carts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  violet_cart_id TEXT NOT NULL UNIQUE,
  user_id        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id     TEXT,           -- for anonymous guests
  status         TEXT NOT NULL DEFAULT 'active', -- active | completed | abandoned
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT carts_has_owner CHECK (user_id IS NOT NULL OR session_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS cart_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id     UUID NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  sku_id      TEXT NOT NULL,
  quantity    INT NOT NULL CHECK (quantity >= 1),
  unit_price  INT NOT NULL,  -- in cents
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE cart_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own carts"
  ON carts FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Cart items accessible by cart owner"
  ON cart_items FOR ALL
  USING (
    cart_id IN (SELECT id FROM carts WHERE auth.uid() = user_id)
  );
```

**Naming**: The architecture doc references `00004_cart_sessions.sql` but the project uses timestamp-based names (see existing migrations). Use `20260314000000_carts.sql`.

### Web File Structure

```
apps/web/src/
├── contexts/
│   └── CartContext.tsx         ← NEW: CartProvider + useCartContext
├── server/
│   └── cartActions.ts         ← NEW: Server Functions for cart CRUD
├── features/
│   └── cart/
│       ├── CartDrawer.tsx     ← NEW: slide-in cart drawer
│       ├── CartItem.tsx       ← NEW: single item row with quantity controls
│       ├── CartEmpty.tsx      ← NEW: empty state component
│       └── CartBag.tsx        ← NEW: merchant bag grouping wrapper
├── routes/
│   └── cart/
│       └── index.tsx          ← NEW: full cart page (CSR — no loader)
└── styles/
    └── components/
        └── cart-drawer.css    ← NEW: BEM styles for drawer
```

### Mobile File Structure

```
apps/mobile/src/app/
└── cart.tsx                   ← UPDATE: replace "coming in Epic 4" placeholder

supabase/functions/
└── cart/
    └── index.ts               ← NEW: Edge Function for mobile cart proxy
```

**Important**: Mobile `cart.tsx` is at `apps/mobile/src/app/cart.tsx` (NOT in a `(tabs)/` subfolder). The file already exists as a placeholder with `<ThemedText>Shopping cart coming in Epic 4.</ThemedText>` — replace its contents entirely.

### Shared Package Changes

```
packages/shared/src/
├── types/
│   ├── cart.types.ts          ← UPDATE: enhance with full Violet fields
│   └── index.ts               ← UPDATE: re-export new types
├── schemas/
│   ├── cart.schema.ts         ← NEW: Zod schemas for cart validation
│   └── index.ts               ← UPDATE: export cart schema
├── hooks/
│   ├── useCart.ts             ← NEW: TanStack Query cart hooks
│   └── index.ts               ← UPDATE: export useCart
└── adapters/
    ├── supplierAdapter.ts     ← UPDATE: add updateCartItem(cartId, skuId, qty), getCart(cartId)
    └── violetAdapter.ts       ← UPDATE: implement new cart methods
```

### CSS (BEM) — Cart Drawer

File: `apps/web/src/styles/components/cart-drawer.css`

BEM blocks:
- `.cart-drawer` — `position: fixed; right: 0; top: 0; height: 100vh; width: 380px; transform: translateX(100%); transition: transform 250ms ease; z-index: var(--z-drawer)`
- `.cart-drawer--open` — modifier: `transform: translateX(0)`
- `.cart-drawer__overlay` — `position: fixed; inset: 0; background: rgba(0,0,0,0.4); transition: opacity 250ms ease; z-index: var(--z-overlay)`
- `.cart-drawer__header` — title bar with close button
- `.cart-drawer__bag` — merchant group section
- `.cart-drawer__item` — single item row
- `.cart-drawer__summary` — subtotal/total section
- `.cart-drawer__actions` — CTA buttons area

Import in `apps/web/src/styles/index.css` after existing component imports.

### Testing Patterns

Follow `packages/shared/src/hooks/__tests__/useProducts.test.ts`:
- Mock `@tanstack/react-query` with `createWrapper()`
- Mock Server Functions at module level
- Test optimistic updates: verify cache update before/after mutation
- Test error rollback: `onError` restores previous cache state

Follow `packages/shared/src/adapters/__tests__/violetAdapter.test.ts`:
- Mock `fetch` globally
- Test 200-with-errors: mock response `{ bags: [...], errors: [{...}] }` and verify structured error return

### Anonymous Cart / Session Handling

Anonymous session pattern established in Epic 2 via Supabase anonymous auth:
1. Check `supabase.auth.getSession()` — anonymous users have `user.is_anonymous = true`
2. Store the Supabase `session.user.id` as `session_id` on the `carts` row
3. When user later logs in, anonymous cart merging is handled in Story 4.6 — do NOT implement merge logic here

### Header Cart Badge

The header is in `apps/web/src/routes/__root.tsx`. Add badge logic:
- Query key: `['cart', 'count']` — derived selector from `useCartQuery` total items
- Display: hidden when 0, brief scale-pulse animation on increment
- Mount `<CartDrawer />` at root level inside `CartProvider`

### References

- [Source: architecture.md#Supplier Abstraction (Adapter Pattern)]
- [Source: architecture.md#Shopping Cart & Checkout data flow]
- [Source: architecture.md#TanStack Server Functions]
- [Source: architecture.md#Caching — staleTime: 0 for cart]
- [Source: architecture.md#SSR strategy — Checkout: CSR]
- [Source: architecture.md#Error handling — Violet 200-with-errors]
- [Source: architecture.md#File tree — apps/web cart/ and checkout/]
- [Source: epics.md#Story 4.1 — acceptance criteria]
- [Source: ux-design-specification.md#Cart Drawer — anatomy, states, interactions]
- [Source: ux-design-specification.md#Micro-animation confirmation — "✓ Added!" 1.5s]
- [Source: apps/web/src/server/violetAdapter.ts — singleton getAdapter() pattern]
- [Source: apps/web/src/server/getProduct.ts — Server Function createServerFn pattern]
- [Source: packages/shared/src/adapters/violetAdapter.ts — fetchWithRetry, mapHttpError]
- [Source: packages/shared/src/types/cart.types.ts — existing placeholder types to extend]
- [Source: supabase/functions/_shared/violetAuth.ts — getVioletHeaders() for Edge Functions]
- [Source: supabase/functions/handle-webhook/index.ts — Edge Function structure pattern]
- [Source: apps/mobile/src/app/cart.tsx — existing placeholder to replace]
- [Source: apps/web/src/hooks/useAuthSession.ts — React Context pattern to follow for CartContext]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

N/A

### Completion Notes List

- `vinxi/http` not available in this project — replaced with `@tanstack/react-start/server` for `getCookie`/`setCookie`
- Mobile `Spacing` scale only has `half`→`six`; replaced `Spacing.eight` and `Spacing.ten` with valid values
- `ProductDetail.test.tsx` updated to mock `useAddToCart` (from `@ecommerce/shared`) and `useCartContext` to avoid Bun workspace dual-React-instance issue
- Cookie pattern: `violet_cart_id` set as HttpOnly cookie via Server Function (30-day expiry, SameSite=lax)
- Pre-existing test failures (1 in shared, 1 in web) are unrelated to Story 4.1 — both were failing before this story

### File List

**Created:**
- `supabase/migrations/20260314000000_carts.sql`
- `packages/shared/src/schemas/cart.schema.ts`
- `packages/shared/src/hooks/useCart.ts`
- `packages/shared/src/hooks/__tests__/useCart.test.ts`
- `packages/shared/src/adapters/__tests__/violetCartAdapter.test.ts`
- `apps/web/src/server/cartActions.ts`
- `apps/web/src/server/supabaseServer.ts`
- `apps/web/src/contexts/CartContext.tsx`
- `apps/web/src/features/cart/CartDrawer.tsx`
- `apps/web/src/features/cart/CartItem.tsx`
- `apps/web/src/features/cart/CartEmpty.tsx`
- `apps/web/src/features/cart/CartBag.tsx`
- `apps/web/src/routes/cart/index.tsx`
- `apps/web/src/styles/components/cart-drawer.css`
- `supabase/functions/cart/index.ts`

**Modified:**
- `apps/web/src/routeTree.gen.ts` (auto-generated by TanStack Router when `/cart` route added)
- `packages/shared/src/types/cart.types.ts`
- `packages/shared/src/types/index.ts`
- `packages/shared/src/schemas/index.ts`
- `packages/shared/src/hooks/index.ts`
- `packages/shared/src/adapters/supplierAdapter.ts`
- `packages/shared/src/adapters/violetAdapter.ts`
- `packages/shared/src/utils/constants.ts`
- `apps/web/src/routes/__root.tsx`
- `apps/web/src/styles/index.css`
- `apps/web/src/styles/tokens.css`
- `apps/web/src/components/product/ProductDetail.tsx`
- `apps/web/src/components/product/__tests__/ProductDetail.test.tsx`
- `apps/mobile/src/app/cart.tsx`
- `apps/mobile/src/app/products/[productId].tsx`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

### Change Log

| Date | Change | Details |
|------|--------|---------|
| 2026-03-14 | Implemented Story 4.1 | All 10 tasks complete — cart creation, item management, web drawer, mobile cart screen, Edge Function |
