# Story 4.2: Cart Summary with Transparent Pricing (Web + Mobile)

Status: done

## Quick Reference — Files to Create/Update

| Action | File | Notes |
|--------|------|-------|
| CREATE | `supabase/migrations/20260315000000_cart_items_product_info.sql` | Add product_name + thumbnail_url columns to cart_items |
| UPDATE | `packages/shared/src/types/cart.types.ts` | Add `name?`, `thumbnailUrl?` to CartItem; add `productName?`, `thumbnailUrl?` to CartItemInput |
| UPDATE | `apps/web/src/server/cartActions.ts` | addToCartFn stores product info; getCartFn enriches from Supabase |
| UPDATE | `apps/web/src/features/cart/CartBag.tsx` | Add tax + shipping rows per Bag |
| UPDATE | `apps/web/src/features/cart/CartItem.tsx` | Show product name + thumbnail if available |
| UPDATE | `apps/web/src/features/cart/CartDrawer.tsx` | Add "View Full Cart" link; update footer summary to show subtotal + tax + shipping |
| UPDATE | `apps/web/src/routes/cart/index.tsx` | Use cart.css BEM classes; show per-bag tax/shipping; add affiliate disclosure |
| CREATE | `apps/web/src/styles/pages/cart.css` | BEM: `.cart`, `.cart__bag`, `.cart__item`, `.cart__summary` |
| UPDATE | `apps/web/src/styles/index.css` | Add `@import "./pages/cart.css"` |
| UPDATE | `apps/mobile/src/app/cart.tsx` | Show tax + shipping per bag; "Start Shopping" CTA on empty state |
| UPDATE | `apps/mobile/src/app/products/[productId].tsx` | Pass productName + thumbnailUrl to useAddToCart mutation |

---

## Story

As a **visitor**,
I want to see a clear cart summary with accurate pricing broken down by merchant,
so that I understand exactly what I'm paying before checkout.

## Acceptance Criteria

1. **Given** a visitor views their cart (web drawer or full page, or mobile cart screen)
   **When** cart data is loaded via `GET /checkout/cart/{id}`
   **Then** the cart shows items grouped by merchant Bag

2. **And** each Bag section displays: merchant name, items with product names/thumbnails/quantities/prices

3. **And** subtotal per Bag is displayed

4. **And** estimated tax is shown per Bag (from Violet's `bag.tax` field; display `$0.00` if zero — tax calculated by Violet at checkout)

5. **And** estimated shipping is shown per Bag: display the value from `bag.shippingTotal` if > 0; display "Calculated at checkout" if `shippingTotal === 0` (shipping is selected in Story 4.3)

6. **And** cart grand total = sum of all Bag totals (subtotal + tax + shippingTotal per bag) — reflects the true total to pay

7. **And** no fake discounts, countdown timers, or manipulative urgency indicators (FR10)

8. **And** affiliate disclosure is visible on the cart page (FR11): "We earn a commission on purchases — this doesn't affect the price you pay."

9. **And** web: both the cart drawer (quick view) and the full cart page (`/cart`) exist; the cart drawer footer includes a "View Full Cart" link to `/cart` alongside the "Proceed to Checkout" button

10. **And** web: cart page uses BEM CSS with block `.cart` (`.cart__bag`, `.cart__item`, `.cart__summary`); cart drawer continues to use existing `.cart-drawer` BEM

11. **And** mobile: cart screen shows per-bag tax and shipping rows; "Calculated at checkout" text for zero shipping

12. **And** empty cart state shows: `🛍` icon, "Your bag is empty" text, "Start Shopping" CTA (closes drawer / navigates to /products on mobile)

13. **And** `useCartQuery` hook (query key `['cart', 'detail', cartId]`) handles data fetching — no new hooks needed

## Tasks / Subtasks

- [x] Task 1: Supabase migration — add product info columns to cart_items (AC: #2)
  - [x] Create `supabase/migrations/20260315000000_cart_items_product_info.sql`
  - [x] ADD COLUMN `product_name TEXT` to `cart_items` (nullable — legacy rows ok)
  - [x] ADD COLUMN `thumbnail_url TEXT` to `cart_items` (nullable)

- [x] Task 2: Extend CartItem type and CartItemInput (AC: #2)
  - [x] In `packages/shared/src/types/cart.types.ts`, add `name?: string` and `thumbnailUrl?: string` to `CartItem` interface
  - [x] Add `productName?: string` and `thumbnailUrl?: string` to `CartItemInput` interface (passed by product page at add-to-cart time)

- [x] Task 3: Update addToCartFn — store product info in cart_items (AC: #2)
  - [x] In `apps/web/src/server/cartActions.ts`, after Violet confirms item was added, upsert a row in `cart_items` table with `(cart_id, sku_id, quantity, unit_price, product_name, thumbnail_url)`
  - [x] `addToCartFn` input type must accept `productName?` and `thumbnailUrl?`
  - [x] Use `onConflict: "cart_id, sku_id"` for upsert (update product_name/thumbnail if item already exists)

- [x] Task 4: Update getCartFn — enrich cart items with product info (AC: #2)
  - [x] In `apps/web/src/server/cartActions.ts` `getCartFn`, after getting the Violet cart and supabaseCartId, query `cart_items` for that `cart_id`
  - [x] Build a map: `{ [skuId]: { productName: string | null, thumbnailUrl: string | null } }`
  - [x] Merge into Cart bags items: set `item.name` and `item.thumbnailUrl` from the map

- [x] Task 5: Update CartBag — add tax/shipping rows (AC: #3, #4, #5)
  - [x] In `apps/web/src/features/cart/CartBag.tsx`, add rows below the existing subtotal row:
    - Tax: `"Est. Tax"` + formatted cents (display even if $0.00 — Violet calculates at checkout)
    - Shipping: `"Est. Shipping"` + `formatCents(bag.shippingTotal)` if > 0, else `"Calculated at checkout"`
  - [x] Use existing BEM class pattern: add `.cart-drawer__bag-tax` and `.cart-drawer__bag-shipping` (or reuse `.cart-drawer__bag-subtotal` styling)

- [x] Task 6: Update CartItem — show product name + thumbnail (AC: #2)
  - [x] In `apps/web/src/features/cart/CartItem.tsx`, show `item.name ?? "SKU " + item.skuId` as the item name
  - [x] If `item.thumbnailUrl` exists, render a small thumbnail image (40×40px) alongside the item name
  - [x] Add `.cart-drawer__item-thumbnail` class (img: `width: 40px; height: 40px; object-fit: cover; border-radius: var(--radius-sm)`)
  - [x] Update `.cart-drawer__item` grid to accommodate thumbnail: `grid-template-columns: 40px 1fr auto` when thumbnail present

- [x] Task 7: Update CartDrawer — add "View Full Cart" link + breakdown in footer (AC: #9, #6)
  - [x] In `apps/web/src/features/cart/CartDrawer.tsx`, add a `<Link to="/cart">View Full Cart</Link>` in the `.cart-drawer__actions` section, between the items and the "Proceed to Checkout" button
  - [x] Update the `.cart-drawer__summary` to show grand total (already uses `cart.total` — update adapter to compute total including tax + shipping)
  - [x] Style: `"View Full Cart"` as a secondary text link (smaller, subdued — `.cart-drawer__view-cart-link` class)

- [x] Task 8: Update Cart.total calculation in adapter (AC: #6)
  - [x] In `packages/shared/src/adapters/violetAdapter.ts`, in `parseAndTransformCart()`, change the total calculation to include tax and shipping:
    ```typescript
    const total = bags.reduce((sum, b) => sum + b.subtotal + b.tax + b.shippingTotal, 0);
    ```
  - [x] This ensures `cart.total` always reflects the true amount to pay (including $0 shipping at this stage)

- [x] Task 9: Create cart.css — full cart page BEM (AC: #10)
  - [x] Create `apps/web/src/styles/pages/cart.css` with BEM block `.cart`:
    - `.cart` — main wrapper
    - `.cart__title` — "Your Bag (N)" heading
    - `.cart__layout` — two-column grid on desktop (items + summary sidebar)
    - `.cart__items` — left column
    - `.cart__bag` — per-merchant section (distinct from `.cart-drawer__bag`)
    - `.cart__bag-merchant` — merchant name header
    - `.cart__item` — item row (similar to drawer but wider — show more detail)
    - `.cart__item-thumbnail` — product thumbnail
    - `.cart__item-info` — name + price text
    - `.cart__item-controls` — quantity +/- and remove button
    - `.cart__bag-pricing` — subtotal/tax/shipping rows per bag
    - `.cart__bag-row` — a single pricing row (label + value)
    - `.cart__summary` — right sidebar (grand total + CTA + affiliate disclosure)
    - `.cart__summary-row` — grand total row
    - `.cart__checkout-btn` — primary CTA button
    - `.cart__continue-link` — secondary "Continue Shopping" link
    - `.cart__affiliate` — affiliate disclosure text (small, subdued)
  - [x] Add `@import "./pages/cart.css"` to `apps/web/src/styles/index.css` after existing page imports

- [x] Task 10: Update full cart page — use cart.css BEM + disclosure + pricing breakdown (AC: #2–#10)
  - [x] In `apps/web/src/routes/cart/index.tsx`:
    - Replace `cart-page__*` class names with `cart__*` BEM from Task 9
    - Show per-bag pricing: Bag subtotal + Est. Tax + Est. Shipping row (same logic as Task 5)
    - Show grand total = `cart.total` (now includes tax + shipping from Task 8)
    - Add affiliate disclosure text below the checkout button: `<p className="cart__affiliate">We earn a commission on purchases — this doesn't affect the price you pay.</p>`
    - Keep the `CartBag` component usage (now updated with tax/shipping)
    - **Simplest approach implemented**: aggregated pricing breakdown in `.cart__summary` sidebar

- [x] Task 11: Update ProductDetail — pass productName + thumbnailUrl at add-to-cart time (AC: #2)
  - [x] In `apps/web/src/components/product/ProductDetail.tsx`, update the `useAddToCart` call to pass `productName: product.name` and `thumbnailUrl: product.thumbnailUrl ?? undefined`
  - [x] The `useAddToCart` mutation in `useCart.ts` needs to accept and forward these fields through to `addToCartFn`

- [x] Task 12: Update mobile cart screen — tax/shipping per bag (AC: #5, #11, #12)
  - [x] In `apps/mobile/src/app/cart.tsx`, update `BagSection` to show two additional rows below subtotal:
    - Est. Tax: `{formatCents(bag.tax)}`
    - Est. Shipping: `bag.shippingTotal > 0 ? formatCents(bag.shippingTotal) : "Calculated at checkout"`
  - [x] Update the empty state to include a navigation CTA: `router.push("/")` (home = products tab)
  - [x] Update `CartItemRow` to show `item.name ?? "SKU " + item.skuId` as the item name

- [x] Task 13: Update mobile ProductDetail — pass productName + thumbnailUrl (AC: #2)
  - [x] In `apps/mobile/src/app/products/[productId].tsx`, when calling the add-to-cart Edge Function, include `productName` and `thumbnailUrl` in the request body (currently undefined — awaiting real product data fetch)

- [x] Task 14: Update Edge Function cart — store product info (AC: #2)
  - [x] In `supabase/functions/cart/index.ts`, when handling POST `/{id}/skus` (add item), extract `productName` and `thumbnailUrl` from request body and upsert them to `cart_items` table (same logic as web Server Function in Task 3)
  - [x] When handling GET `/{id}` (fetch cart), query `cart_items` for the supabase cart_id and enrich items with product names/thumbnails before returning

## Dev Notes

### Critical Architecture Constraints

- **NEVER expose Violet token to client** — existing constraint from 4.1, unchanged.

- **cart.total MUST include tax + shipping** — The current adapter computes `total` as sum of bag subtotals only. This story requires updating to `sum(subtotal + tax + shippingTotal)` per bag. At this stage, `shippingTotal` is 0 for all bags (shipping selected in Story 4.3), so the number won't change much — but the code must be correct for when Story 4.3 adds shipping.

- **Product name is NOT in Violet cart API response** — Violet's `GET /checkout/cart/{id}` returns bags with skus that only contain `{ id, sku_id, quantity, price }`. There are no product names or images. The only way to show product names is to store them in our Supabase `cart_items` table at add-to-cart time and look them up on fetch. See Tasks 2–4.

- **cart_items table needs new columns** — The `cart_items` table from Story 4.1 does NOT have `product_name` or `thumbnail_url` columns. A new migration is required. Existing rows will have NULL values for these columns (that's fine — show "SKU {skuId}" as fallback).

- **Concurrent product info enrichment** — The `getCartFn` currently only enriches the `id` (Supabase cart UUID) from the DB. Task 4 adds a second Supabase query to fetch product info. This is acceptable since it's a single `SELECT` with a list of sku_ids.

- **CartBag component class naming** — The existing `CartBag` component uses `.cart-drawer__bag*` BEM classes (appropriate for the drawer). The full cart page should use its own `.cart__bag*` BEM classes. The simplest approach for the full cart page is to NOT reuse `CartBag` directly (or accept a variant prop). The full cart page already has its own loop over `cart.bags` — just inline the cart-page-specific markup using `.cart__*` classes.

### C1 — Supabase cart_items upsert pattern

When adding an item to cart via `addToCartFn`, after the Violet adapter confirms success, upsert the item into `cart_items`:

```typescript
// In addToCartFn handler, after adapter.addToCart() succeeds:
const supabase = getSupabaseServer();
await supabase
  .from("cart_items")
  .upsert(
    {
      cart_id: supabaseCartId,
      sku_id: item.skuId,
      quantity: item.quantity,
      unit_price: /* from adapter result - find this item in the returned cart */,
      product_name: data.productName ?? null,
      thumbnail_url: data.thumbnailUrl ?? null,
    },
    { onConflict: "cart_id, sku_id" },
  );
```

Note: `unit_price` comes from the returned cart item. Find the item in `result.data.bags[].items` where `item.skuId === data.skuId` to get `unitPrice`.

### C2 — getCartFn enrichment pattern

```typescript
// After getting Violet cart and supabaseCartId:
const supabase = getSupabaseServer();
const { data: storedItems } = await supabase
  .from("cart_items")
  .select("sku_id, product_name, thumbnail_url")
  .eq("cart_id", supabaseCartId);

// Build lookup map
const productInfoMap: Record<string, { name: string | null; thumbnailUrl: string | null }> = {};
for (const row of storedItems ?? []) {
  productInfoMap[row.sku_id] = {
    name: row.product_name,
    thumbnailUrl: row.thumbnail_url,
  };
}

// Merge into cart bags items
const enrichedCart: Cart = {
  ...result.data,
  id: supabaseCartId,
  bags: result.data.bags.map((bag) => ({
    ...bag,
    items: bag.items.map((item) => ({
      ...item,
      name: productInfoMap[item.skuId]?.name ?? undefined,
      thumbnailUrl: productInfoMap[item.skuId]?.thumbnailUrl ?? undefined,
    })),
  })),
};
return { data: enrichedCart, error: null };
```

### C3 — useCart.ts hook update for productName/thumbnailUrl

The `useAddToCart` hook in `packages/shared/src/hooks/useCart.ts` wraps the `addToCartFn` call. Update its input type to pass through `productName?` and `thumbnailUrl?`:

```typescript
// Input to useAddToCart mutation:
type AddToCartInput = {
  violetCartId: string;
  skuId: string;
  quantity: number;
  productName?: string;
  thumbnailUrl?: string;
  userId?: string | null;
  sessionId?: string | null;
};
```

The mutation calls `addToCartFn({ data: input })` — the Server Function already accepts these optional fields after Task 3.

### C4 — Cart drawer footer update

The CartDrawer footer currently has:
- `.cart-drawer__summary` → total row
- `.cart-drawer__actions` → "Proceed to Checkout" btn + "Continue Shopping" link

After this story, it should be:
- `.cart-drawer__summary` → total row (unchanged — shows `cart.total`)
- `.cart-drawer__actions` → "Proceed to Checkout" btn + "View Full Cart" link + "Continue Shopping" link

"View Full Cart" should be styled as a secondary link (not a button):
```html
<Link to="/cart" className="cart-drawer__view-cart-link" onClick={closeDrawer}>
  View Full Cart
</Link>
```

CSS for `.cart-drawer__view-cart-link`:
```css
.cart-drawer__view-cart-link {
  display: block;
  text-align: center;
  font-size: 0.8125rem;
  color: var(--color-steel);
  text-decoration: none;
  transition: color var(--transition-fast);
}
.cart-drawer__view-cart-link:hover { color: var(--color-ink); }
```
Add this to `cart-drawer.css` alongside `.cart-drawer__continue-link`.

### C5 — Full cart page layout (desktop: 2-column)

The full cart page should have a two-column layout on desktop:
- Left: items grouped by merchant bag (flex: 1)
- Right: pricing summary sidebar (width: ~320px, sticky)

The summary sidebar shows:
```
Subtotal   $XX.XX
Est. Tax   $X.XX
Shipping   Calculated at checkout  (or $X.XX)
─────────────────
Total      $XX.XX

[Proceed to Checkout]
[Continue Shopping]

We earn a commission on purchases — this doesn't affect the price you pay.
```

On mobile web: stack layout (items above, summary below).

### Violet API Reference (unchanged from Story 4.1)

| Action | Method | Endpoint |
|--------|--------|----------|
| Get cart | GET | `/checkout/cart/{cartId}` |

No new Violet API calls in this story. All data comes from the existing `GET /checkout/cart/{id}` response plus the Supabase `cart_items` enrichment.

### CSS Architecture for cart.css

File: `apps/web/src/styles/pages/cart.css`

```css
/* Block: .cart — full cart page */
.cart { ... }
.cart__title { font-family: var(--font-display); font-size: 1.5rem; ... }
.cart__layout { display: grid; grid-template-columns: 1fr 320px; gap: var(--space-12); ... }
.cart__items { /* left column */ }
.cart__bag { border-bottom: 1px solid var(--border-subtle); margin-bottom: var(--space-8); padding-bottom: var(--space-6); }
.cart__bag-merchant { font-size: 0.75rem; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--color-steel); ... }
.cart__item { display: grid; grid-template-columns: 56px 1fr auto; gap: var(--space-4); padding: var(--space-4) 0; border-bottom: 1px solid var(--border-subtle); }
.cart__item-thumbnail { width: 56px; height: 56px; object-fit: cover; border-radius: var(--radius-sm); background: var(--color-sand); }
.cart__item-name { font-size: 0.875rem; font-weight: 500; ... }
.cart__item-price { font-size: 0.8125rem; color: var(--color-steel); }
.cart__bag-pricing { margin-top: var(--space-4); }
.cart__bag-row { display: flex; justify-content: space-between; font-size: 0.8125rem; color: var(--color-steel); padding: var(--space-1) 0; }
.cart__bag-row--subtotal { font-weight: 500; }
.cart__bag-row--total { font-weight: 600; color: var(--color-ink); border-top: 1px solid var(--border-subtle); padding-top: var(--space-2); margin-top: var(--space-1); }
.cart__summary { ... sticky top: 120px; }
.cart__summary-total { display: flex; justify-content: space-between; font-weight: 600; font-size: 1.125rem; ... }
.cart__checkout-btn { ... same style as cart-drawer__checkout-btn but full width }
.cart__continue-link { ... similar to cart-drawer__continue-link }
.cart__affiliate { font-size: 0.75rem; color: var(--color-silver); text-align: center; margin-top: var(--space-4); }

/* Responsive: stack on mobile */
@media (max-width: 768px) {
  .cart__layout { grid-template-columns: 1fr; }
}
```

Use existing design tokens: `var(--space-*)`, `var(--color-*)`, `var(--font-*)`, `var(--radius-*)`, `var(--shadow-*)`.

### Previous Story Intelligence (from 4.1)

- **`vinxi/http` not available** — use `@tanstack/react-start/server` for `getCookie`/`setCookie` (already established)
- **`@tanstack/react-router` for `Link`** — use `<Link to="/cart">` not `<a href="/cart">`
- **Cart page is CSR** — `createFileRoute` with no `loader` (already correct)
- **`getAdapter()` singleton** — never create a new adapter instance in Server Functions
- **Bun workspace dual-React issue** — when writing tests for hooks, mock the Server Function at module level (see `ProductDetail.test.tsx` pattern)
- **Mobile Spacing scale** — only `half` → `six` + `eight` are valid values in the `Spacing` constant. Do NOT use `Spacing.ten` etc.

### Empty State Pattern

Web (`CartEmpty.tsx`) — already shows icon + text + "Start shopping" button that calls `closeDrawer()`. No changes needed.

Mobile (`apps/mobile/src/app/cart.tsx`) — currently shows icon + text but no CTA. Update to add a "Start Shopping" button that navigates to the products tab:

```typescript
import { router } from "expo-router";
// In empty state:
<TouchableOpacity onPress={() => router.push("/(tabs)/products")}>
  <ThemedText>Start Shopping</ThemedText>
</TouchableOpacity>
```

### Testing Patterns

Follow existing patterns from `packages/shared/src/hooks/__tests__/useCart.test.ts`:
- Mock Server Functions at module level
- Test that `name` and `thumbnailUrl` fields are passed through correctly
- The enrichment logic (Tasks 3-4) is server-side — no unit tests needed for those (integration tested manually via the app)

No new hook is needed for this story — `useCartQuery`, `useAddToCart`, etc. are already in place.

### Project Structure Notes

- The `features/cart/` folder is the right location for cart UI components (`CartBag`, `CartItem`, `CartDrawer`, `CartEmpty`)
- The full cart page lives at `apps/web/src/routes/cart/index.tsx` (already exists)
- BEM convention: `.cart` block for the full cart page (distinct from `.cart-drawer` used by the drawer component)
- Import order in `index.css`: `cart.css` goes after the existing page imports (after `search.css`)

### References

- [Source: epics.md#Story 4.2 — full acceptance criteria]
- [Source: epics.md#Epic 4 — Violet.io dependencies, wallet_based_checkout note]
- [Source: architecture.md#Caching — staleTime: 0 for cart]
- [Source: architecture.md#SSR strategy — Checkout: CSR; applies to cart page too]
- [Source: architecture.md#File tree — features/cart/, routes/cart/]
- [Source: architecture.md#Shopping Cart & Checkout data flow]
- [Source: ux-design-specification.md#Cart — Search-Forward mode, transparent totals]
- [Source: ux-design-specification.md#Trust Signals — FTC affiliate disclosure at checkout]
- [Source: ux-design-specification.md#Empty states — "Your bag is empty" + "Start browsing" CTA]
- [Source: ux-design-specification.md#cart.css in CSS architecture]
- [Source: apps/web/src/features/cart/CartBag.tsx — existing bag structure to extend]
- [Source: apps/web/src/features/cart/CartItem.tsx — existing item row to extend]
- [Source: apps/web/src/features/cart/CartDrawer.tsx — existing drawer footer to update]
- [Source: apps/web/src/routes/cart/index.tsx — full cart page to update]
- [Source: apps/web/src/styles/components/cart-drawer.css — existing BEM classes + tokens to reuse]
- [Source: apps/web/src/components/product/ProductDetail.tsx — affiliate disclosure pattern (`product-detail__affiliate`)]
- [Source: packages/shared/src/types/cart.types.ts — Cart, Bag, CartItem, CartItemInput to extend]
- [Source: packages/shared/src/adapters/violetAdapter.ts — transformCartSku(), parseAndTransformCart()]
- [Source: apps/web/src/server/cartActions.ts — addToCartFn, getCartFn, upsertSupabaseCart pattern]
- [Source: supabase/migrations/20260314000000_carts.sql — cart_items table structure to extend]
- [Source: apps/mobile/src/app/cart.tsx — BagSection, CartItemRow to update]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

No blockers encountered. Pre-existing webhook schema test failure in `packages/shared` confirmed to be unrelated to this story (present on main before any changes).

### Completion Notes List

- Implemented all 14 tasks in order, all TypeScript types pass, lint passes, 150 web tests pass
- The `addToCartFn` now upserts product info into `cart_items` after Violet confirms the item; `getCartFn` joins this data back at read time
- Cart total calculation updated in both `violetAdapter.ts` (web) and Edge Function to include `subtotal + tax + shippingTotal` per bag
- Full cart page rewritten with `.cart__*` BEM block (distinct from `.cart-drawer__*`)
- Mobile CTA navigates to `"/"` (home/products tab) — `/(tabs)/products` path doesn't exist in this app's Expo Router config
- Mobile `productName`/`thumbnailUrl` remain `undefined` in `[productId].tsx` as real product data fetch is not yet wired up (placeholder comment added)

### Code Review Fixes (AI Review — 2026-03-14)

- **[H1]** `cart/index.tsx` — "Proceed to Checkout" now links to `/checkout` (was `/`)
- **[H2]** `CartDrawer.tsx` — "Proceed to Checkout" now links to `/checkout` (was `/cart`, same as "View Full Cart")
- **[H3]** `cart/index.tsx` — Added per-bag pricing rows (subtotal / Est. Tax / Est. Shipping) for each bag, satisfying AC #3–#5; `.cart__bag-pricing` CSS classes now used
- **[H4]** `cartActions.ts` + `supabase/functions/cart/index.ts` — `removeFromCartFn` now deletes from `cart_items` after Violet confirms removal; prevents orphan row accumulation
- **[M1]** `cartActions.ts` — `updateCartItemFn` now syncs quantity to `cart_items.quantity` after Violet confirms the update
- **[M2]** `cartActions.ts` + Edge Function `upsertCartItem()` — upsert errors now logged via `console.warn` (non-fatal, product info won't display but cart functions correctly)
- **[M3]** `apps/mobile/src/app/cart.tsx` — `isUpdating` propagated from `CartScreen` → `BagSection` → `CartItemRow`; qty buttons now disabled during in-flight mutations
- **[M4]** `apps/mobile/src/app/cart.tsx` — Removed `Content-Type: application/json` from GET request in `fetchCartFromEdge` (consistent with VioletAdapter M2 fix)
- **[stub]** `apps/web/src/routes/checkout/index.tsx` — Created placeholder checkout route (Story 4.3) so TanStack Router accepts `/checkout` as a valid destination

### File List

- `supabase/migrations/20260315000000_cart_items_product_info.sql` (created)
- `packages/shared/src/types/cart.types.ts` (updated)
- `packages/shared/src/hooks/useCart.ts` (updated)
- `packages/shared/src/adapters/violetAdapter.ts` (updated)
- `apps/web/src/server/cartActions.ts` (updated)
- `apps/web/src/features/cart/CartBag.tsx` (updated)
- `apps/web/src/features/cart/CartItem.tsx` (updated)
- `apps/web/src/features/cart/CartDrawer.tsx` (updated)
- `apps/web/src/routes/cart/index.tsx` (updated)
- `apps/web/src/styles/pages/cart.css` (created)
- `apps/web/src/styles/index.css` (updated)
- `apps/web/src/styles/components/cart-drawer.css` (updated)
- `apps/web/src/components/product/ProductDetail.tsx` (updated)
- `apps/mobile/src/app/cart.tsx` (updated)
- `apps/mobile/src/app/products/[productId].tsx` (updated)
- `supabase/functions/cart/index.ts` (updated)
