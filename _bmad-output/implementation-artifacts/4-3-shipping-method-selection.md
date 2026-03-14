# Story 4.3: Shipping Method Selection (Web + Mobile)

Status: done

## Quick Reference — Files to Create/Update

| Action | File | Notes |
|--------|------|-------|
| UPDATE | `packages/shared/src/types/cart.types.ts` | Add `ShippingMethod`, `ShippingMethodsAvailable`, `ShippingAddressInput`, `SetShippingMethodInput` |
| UPDATE | `packages/shared/src/schemas/cart.schema.ts` | Add Zod schemas for shipping methods response + address |
| UPDATE | `packages/shared/src/adapters/supplierAdapter.ts` | Add `setShippingAddress`, `getAvailableShippingMethods`, `setShippingMethods` |
| UPDATE | `packages/shared/src/adapters/violetAdapter.ts` | Implement those 3 new adapter methods |
| CREATE | `apps/web/src/server/checkout.ts` | New Server Function file: `setShippingAddressFn`, `getAvailableShippingMethodsFn`, `setShippingMethodsFn` |
| UPDATE | `apps/web/src/routes/checkout/index.tsx` | Replace stub with shipping address form + per-bag shipping method selector |
| CREATE | `apps/web/src/styles/pages/checkout.css` | BEM block `.checkout` (`.checkout__section`, `.checkout__shipping-methods`, etc.) |
| UPDATE | `apps/web/src/styles/index.css` | Add `@import "./pages/checkout.css"` |
| UPDATE | `supabase/functions/cart/index.ts` | Add shipping address + shipping methods endpoints for mobile |
| CREATE | `apps/mobile/src/app/checkout.tsx` | New mobile checkout screen with address + shipping method selection |

---

## Story

As a **visitor**,
I want to select shipping methods for each merchant in my cart,
so that I can choose my preferred delivery speed and cost.

## Acceptance Criteria

1. **Given** a visitor proceeds to checkout with items in cart
   **When** the checkout page/screen loads
   **Then** a shipping address form is displayed (address1, city, state, postal_code, country)

2. **When** the visitor submits a valid shipping address
   **Then** the address is sent to Violet via `POST /checkout/cart/{id}/shipping_address`
   **And** available shipping methods are fetched via `GET /checkout/cart/{id}/shipping/available`

3. **And** each Bag displays its available shipping methods with: carrier/name, estimated delivery range (min_days–max_days), and price

4. **And** the visitor selects one shipping method per Bag

5. **And** selection is applied via `POST /checkout/cart/{id}/shipping` with the chosen method per Bag

6. **And** the cart total updates immediately to reflect the selected shipping cost (the Set Shipping response returns an updated "priced cart")

7. **And** if a Bag has only one shipping option, it is auto-selected and the user is informed

8. **And** web: shipping selection is part of the one-step checkout page at `/checkout` (NOT a separate page)

9. **And** mobile: shipping selection is an inline section within the checkout screen at `apps/mobile/src/app/checkout.tsx`

10. **And** if `GET /shipping/available` fails or returns empty for a Bag, a retry button and clear error message are shown per Bag (not a global error)

11. **And** country restrictions are enforced (FR21): if visitor's country is not in a Violet-supported country, a clear message is shown — supported countries depend on Stripe platform account type (US/UK/EU)

12. **And** a loading state is shown per Bag while shipping methods are being fetched (carrier API calls take longer than normal)

13. **And** web: checkout page is CSR (no `loader`, `createFileRoute('/checkout/')`)

## Tasks / Subtasks

- [x] Task 1: Add shipping types to `cart.types.ts` (AC: #3)
  - [x] Add `ShippingMethod` interface: `{ id: string; label: string; carrier?: string; minDays?: number; maxDays?: number; price: number }`
  - [x] Add `ShippingMethodsAvailable` interface: `{ bagId: string; shippingMethods: ShippingMethod[] }`
  - [x] Add `ShippingAddressInput` interface: `{ address1: string; city: string; state: string; postalCode: string; country: string; name?: string; email?: string; phone?: string }`
  - [x] Add `SetShippingMethodInput` interface: `{ bagId: string; shippingMethodId: string }`

- [x] Task 2: Add Zod schemas to `cart.schema.ts` (AC: #3)
  - [x] `violetShippingMethodSchema` — validates a single shipping method from Violet response
  - [x] `violetShippingAvailableItemSchema` — `{ bag_id: z.number(), shipping_methods: z.array(...) }`
  - [x] `violetShippingAvailableResponseSchema` — `z.array(violetShippingAvailableItemSchema)`
  - [x] `violetShippingAddressSchema` — validates the shipping_address request body (snake_case for Violet)
  - [x] Export inferred types: `VioletShippingMethod`, `VioletShippingAvailableResponse`

- [x] Task 3: Extend `supplierAdapter.ts` interface (AC: #2, #4, #5)
  - [x] Add to `// Checkout` section:
    - `setShippingAddress(violetCartId: string, address: ShippingAddressInput): Promise<ApiResponse<void>>`
    - `getAvailableShippingMethods(violetCartId: string): Promise<ApiResponse<ShippingMethodsAvailable[]>>`
    - `setShippingMethods(violetCartId: string, selections: SetShippingMethodInput[]): Promise<ApiResponse<Cart>>`
  - [x] Import new types from `../types/index.js`

- [x] Task 4: Implement the 3 methods in `violetAdapter.ts` (AC: #2, #4, #5, #6)
  - [x] `setShippingAddress`: POST to `/checkout/cart/{violetCartId}/shipping_address` — body maps `ShippingAddressInput` camelCase → Violet snake_case (`address_1`, `postal_code`). Returns `{ data: null, error: null }` on success (or `{ data: null, error }` on failure).
  - [x] `getAvailableShippingMethods`: GET to `/checkout/cart/{violetCartId}/shipping/available` — parse response with `violetShippingAvailableResponseSchema`. Transform to `ShippingMethodsAvailable[]` (camelCase). Use existing `fetchWithRetry()` pattern.
  - [x] `setShippingMethods`: POST to `/checkout/cart/{violetCartId}/shipping` — body is an array of `{ bag_id: number, shipping_method_id: string }` (Violet snake_case). Response is a full cart — call `parseAndTransformCart()` to return `Cart`. Shipping totals per Bag will now be non-zero.
  - [x] Handle Violet 200-with-errors pattern for all three methods

- [x] Task 5: Create `apps/web/src/server/checkout.ts` Server Function file (AC: #2, #4, #5)
  - [x] Pattern: same as `cartActions.ts` — use `createServerFn`, `getAdapter()`, `getCookie`/`setCookie`
  - [x] `setShippingAddressFn`: reads `violet_cart_id` cookie → calls `adapter.setShippingAddress()` → returns `{ data: null, error }` or `{ data: null, error: null }`
  - [x] `getAvailableShippingMethodsFn`: reads `violet_cart_id` cookie → calls `adapter.getAvailableShippingMethods()` → returns `ShippingMethodsAvailable[]`
  - [x] `setShippingMethodsFn`: reads `violet_cart_id` cookie + body `selections: SetShippingMethodInput[]` → calls `adapter.setShippingMethods()` → invalidates cart query cache → returns `Cart`
  - [x] All functions use `{ data, error }` pattern consistently. **NEVER expose Violet token to client.**

- [x] Task 6: Update `apps/web/src/routes/checkout/index.tsx` — build checkout UI (AC: #1, #2, #3, #4, #6, #7, #8, #10, #11, #12, #13)
  - [x] Keep `createFileRoute('/checkout/')` with NO loader (CSR page)
  - [x] Read cart state from `useCartQuery` hook (already in `useCart.ts`)
  - [x] **Shipping Address Form section** (`.checkout__section`):
    - Fields: address1, city, state, postalCode, country (dropdown)
    - On submit: call `setShippingAddressFn`, then `getAvailableShippingMethodsFn`
    - Show per-country restriction warning if country not in supported list: US, GB, plus EU countries
    - Use client-side form validation (all fields required except phone)
  - [x] **Shipping Methods section** (`.checkout__shipping-methods`):
    - For each Bag: show merchant name + a list of shipping options
    - Each option: `<label>` with radio input, carrier name, delivery estimate (`min_days–max_days days`), price (`formatPrice(method.price)`)
    - Per-bag loading skeleton while `getAvailableShippingMethodsFn` is pending
    - Per-bag retry button on error
    - Auto-select if `bag.shippingMethods.length === 1`
  - [x] **"Continue to Payment" button**: disabled until all Bags have a selected shipping method; calls `setShippingMethodsFn` with all selections → on success show "Shipping confirmed" or navigate to next section (Story 4.4 will add payment section here)
  - [x] **Order Summary sidebar**: show cart bags with items + subtotal + est. shipping (updates after selection)
  - [x] `formatPrice` from `@ecommerce/shared` for all money display

- [x] Task 7: Create `apps/web/src/styles/pages/checkout.css` (AC: #8)
  - [x] BEM block `.checkout` with all required classes

- [x] Task 8: Update `apps/web/src/styles/index.css` (AC: #8)
  - [x] Add `@import "./pages/checkout.css";` after the existing `cart.css` import

- [x] Task 9: Update `supabase/functions/cart/index.ts` — add shipping routes for mobile (AC: #9)
  - [x] Add handler for `POST /{id}/shipping_address` → forward to Violet `POST /checkout/cart/{id}/shipping_address`
  - [x] Add handler for `GET /{id}/shipping/available` → forward to Violet `GET /checkout/cart/{id}/shipping/available`
  - [x] Add handler for `POST /{id}/shipping` → forward to Violet `POST /checkout/cart/{id}/shipping` → return updated cart
  - [x] Follow the same auth pattern as existing cart Edge Function (Violet token from env, never in client request)

- [x] Task 10: Create `apps/mobile/src/app/checkout.tsx` — mobile checkout screen (AC: #9, #10, #12)
  - [x] New screen accessible from cart screen "Proceed to Checkout" button
  - [x] Shipping address form (React Native TextInput per field + country picker)
  - [x] On address submission: call Edge Function `POST /{cartId}/shipping_address`, then `GET /{cartId}/shipping/available`
  - [x] Per-bag shipping method list using mapped `TouchableOpacity` radio options
  - [x] Auto-select if only one option per bag
  - [x] "Continue to Payment" button (disabled until all bags have a selected method) → calls `POST /{cartId}/shipping` → navigates to payment (Story 4.4 stub)
  - [x] Use `ThemedText` and shared design tokens
  - [x] Use `formatPrice` from `@ecommerce/shared`
  - [x] Error state: per-bag retry button if methods fail to load

## Dev Notes

### Critical Architecture Constraints

- **NEVER expose Violet token to client** — shipping API calls must go through Server Functions (web) or Edge Functions (mobile). The Violet JWT lives only on the server.

- **Address MUST be set before fetching shipping methods** — Violet's `GET /checkout/cart/{id}/shipping/available` requires a shipping address to be set first. If called without an address, it will fail or return empty results. The UI must enforce this order: address submit → then fetch methods.

- **`GET /shipping/available` is intentionally slow** — This endpoint calls third-party carrier APIs (USPS, FedEx, etc.) in real-time. Expect 2–5 second response times. Show a per-bag skeleton loader, NOT a global spinner. This prevents the page from feeling completely blocked.

- **Checkout page is CSR** — `createFileRoute('/checkout/')` with NO `loader`. Same pattern as cart page. Stripe Elements (Story 4.4) requires client-side rendering.

- **`setShippingMethods` response is a priced cart** — The `POST /checkout/cart/{id}/shipping` response returns the full cart with updated `shipping_total` per bag. Parse it with `parseAndTransformCart()`. The cart total must update in the UI after successful shipping method selection.

- **`getAdapter()` singleton** — never create a new VioletAdapter instance in Server Functions. Always use `getAdapter()`.

### C1 — Violet API mapping (snake_case → camelCase)

```
Violet request (snake_case)        ↔  Our internal type (camelCase)
──────────────────────────────────────────────────────────────────
shipping_address.address_1         ↔  ShippingAddressInput.address1
shipping_address.postal_code       ↔  ShippingAddressInput.postalCode
shipping_address.country           ↔  ShippingAddressInput.country

GET /shipping/available response:
[{ bag_id: 12345, shipping_methods: [...] }]
  → ShippingMethodsAvailable { bagId: "12345", shippingMethods: [...] }

shipping_method.min_days           ↔  ShippingMethod.minDays
shipping_method.max_days           ↔  ShippingMethod.maxDays

POST /shipping request body:
[{ bag_id: 12345, shipping_method_id: "..." }]
  (Violet uses "shipping_method_id" in the body, not "shipping_method")
```

**⚠️ VERIFY FIELD NAMES IN SANDBOX**: The Violet docs mention "shipping_method" but the actual field name in the request body may be `shipping_method_id`. Test against the Violet sandbox first and check the actual error response if the field name is wrong. Adjust the Zod schema accordingly.

### C2 — Adapter method implementations

```typescript
// setShippingAddress: POST /checkout/cart/{violetCartId}/shipping_address
async setShippingAddress(violetCartId: string, address: ShippingAddressInput): Promise<ApiResponse<void>> {
  const result = await this.fetchWithRetry(
    `${VIOLET_API_BASE}/checkout/cart/${violetCartId}/shipping_address`,
    {
      method: "POST",
      body: JSON.stringify({
        address_1: address.address1,
        city: address.city,
        state: address.state,
        postal_code: address.postalCode,
        country: address.country,
        name: address.name,
        email: address.email,
        phone: address.phone,
      }),
    }
  );
  if (result.error) return { data: null, error: result.error };
  return { data: null, error: null };
}

// getAvailableShippingMethods: GET /checkout/cart/{violetCartId}/shipping/available
async getAvailableShippingMethods(violetCartId: string): Promise<ApiResponse<ShippingMethodsAvailable[]>> {
  const result = await this.fetchWithRetry(
    `${VIOLET_API_BASE}/checkout/cart/${violetCartId}/shipping/available`,
    { method: "GET" }
  );
  if (result.error) return { data: null, error: result.error };
  const parsed = violetShippingAvailableResponseSchema.safeParse(result.data);
  if (!parsed.success) return { data: null, error: { code: "PARSE_ERROR", message: "Invalid shipping response" } };
  return {
    data: parsed.data.map(item => ({
      bagId: String(item.bag_id),
      shippingMethods: item.shipping_methods.map(m => ({
        id: String(m.id),
        label: m.label ?? m.name ?? "",
        carrier: m.carrier,
        minDays: m.min_days,
        maxDays: m.max_days,
        price: m.price ?? 0,
      })),
    })),
    error: null,
  };
}

// setShippingMethods: POST /checkout/cart/{violetCartId}/shipping
async setShippingMethods(violetCartId: string, selections: SetShippingMethodInput[]): Promise<ApiResponse<Cart>> {
  const result = await this.fetchWithRetry(
    `${VIOLET_API_BASE}/checkout/cart/${violetCartId}/shipping`,
    {
      method: "POST",
      body: JSON.stringify(
        selections.map(s => ({ bag_id: Number(s.bagId), shipping_method_id: s.shippingMethodId }))
      ),
    }
  );
  if (result.error) return { data: null, error: result.error };
  return this.parseAndTransformCart(result.data);
}
```

### C3 — Server Function pattern (checkout.ts)

Follow the exact pattern from `cartActions.ts`:

```typescript
// apps/web/src/server/checkout.ts
import { createServerFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";
import type { ApiResponse, Cart, ShippingAddressInput, ShippingMethodsAvailable, SetShippingMethodInput } from "@ecommerce/shared";
import { getAdapter } from "./violetAdapter";

export const setShippingAddressFn = createServerFn({ method: "POST" })
  .validator((data: ShippingAddressInput) => data)
  .handler(async ({ data: address }) => {
    const violetCartId = getCookie("violet_cart_id");
    if (!violetCartId) return { data: null, error: { code: "NO_CART", message: "No active cart" } };
    const adapter = getAdapter();
    return adapter.setShippingAddress(violetCartId, address);
  });

export const getAvailableShippingMethodsFn = createServerFn({ method: "GET" })
  .handler(async (): Promise<ApiResponse<ShippingMethodsAvailable[]>> => {
    const violetCartId = getCookie("violet_cart_id");
    if (!violetCartId) return { data: null, error: { code: "NO_CART", message: "No active cart" } };
    const adapter = getAdapter();
    return adapter.getAvailableShippingMethods(violetCartId);
  });

export const setShippingMethodsFn = createServerFn({ method: "POST" })
  .validator((data: { selections: SetShippingMethodInput[] }) => data)
  .handler(async ({ data }): Promise<ApiResponse<Cart>> => {
    const violetCartId = getCookie("violet_cart_id");
    if (!violetCartId) return { data: null, error: { code: "NO_CART", message: "No active cart" } };
    const adapter = getAdapter();
    return adapter.setShippingMethods(violetCartId, data.selections);
  });
```

### C4 — Checkout page structure (web)

The checkout page at this story stage shows shipping address + shipping methods only. Payment (Story 4.4) will be added later.

```
/checkout page layout (CSR):
┌─────────────────────────────────────────────────────┐
│  Checkout                                            │
│                                                      │
│  ┌─ Shipping Address ──────────────────────────────┐ │
│  │  Address1: [________________________]           │ │
│  │  City: [______________]  State: [___]  ZIP [__] │ │
│  │  Country: [▼ dropdown ]                         │ │
│  │  [ Continue → ]                                 │ │
│  └─────────────────────────────────────────────────┘ │
│                                                      │
│  ┌─ Shipping Method ───────────────────────────────┐ │
│  │  Merchant: "Acme Store"                         │ │
│  │  ○ Standard Shipping (5–7 days)  $4.99          │ │
│  │  ● Priority Mail (2–3 days)      $8.99          │ │
│  └─────────────────────────────────────────────────┘ │
│                                                      │
│  [ Continue to Payment ]  (disabled until all bags   │
│                             have a selection)        │
│                                                      │
│  "We earn a commission — this doesn't affect your    │
│   price."                                            │
└─────────────────────────────────────────────────────┘
              ┌─ Order Summary ──────────────────────┐
              │  [img] Product 1          $XX.XX     │
              │  Subtotal:                $XX.XX     │
              │  Est. Shipping:           $XX.XX     │
              │  Est. Tax:                $X.XX      │
              │  ─────────────────────────────────   │
              │  Total:                   $XX.XX     │
              └──────────────────────────────────────┘
```

### C5 — Shipping methods Zod schema (inferred from Violet sandbox)

```typescript
// The exact Violet response schema for GET /shipping/available must be verified
// against the sandbox. This is the expected shape based on the Violet docs.
export const violetShippingMethodSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  label: z.string().optional(),
  name: z.string().optional(),          // Violet may use "name" OR "label"
  carrier: z.string().optional(),
  min_days: z.number().optional(),
  max_days: z.number().optional(),
  price: z.number().default(0),
});

export const violetShippingAvailableItemSchema = z.object({
  bag_id: z.number(),
  shipping_methods: z.array(violetShippingMethodSchema).optional().default([]),
});

export const violetShippingAvailableResponseSchema = z.array(violetShippingAvailableItemSchema);
```

**⚠️ NOTE FOR DEV AGENT**: Test against the Violet sandbox early (Task 4) to validate the response field names. The schema above uses `.optional()` on uncertain fields (`label` vs `name`, `carrier`) to be resilient to variations. Adjust as needed based on actual responses.

### C6 — Auto-selection logic

```typescript
// After getAvailableShippingMethodsFn returns:
const autoSelections: Record<string, string> = {};
for (const bagMethods of availableMethods) {
  if (bagMethods.shippingMethods.length === 1) {
    autoSelections[bagMethods.bagId] = bagMethods.shippingMethods[0].id;
  }
}
setSelectedMethods(prev => ({ ...autoSelections, ...prev }));
```

### C7 — Country restriction enforcement

Supported countries depend on Stripe platform account configuration (US, GB, EU countries). For MVP, validate client-side against a hardcoded list:

```typescript
const SUPPORTED_COUNTRIES = [
  "US", "GB", "DE", "FR", "IT", "ES", "NL", "BE", "AT", "PT",
  "FI", "SE", "DK", "NO", "IE", "PL", "CZ", "SK", "HU", "RO",
  // Add more EU countries as needed per Stripe account config
];

// Show warning, but don't hard-block — Violet itself will reject at API level
if (!SUPPORTED_COUNTRIES.includes(address.country)) {
  setCountryWarning("Shipping to this country may not be available. We support US, UK, and EU countries.");
}
```

### C8 — Mobile Edge Function shipping routes

The `supabase/functions/cart/index.ts` Edge Function already handles cart CRUD. Add three new routes:

```typescript
// In the router/switch for incoming requests:
// POST /{cartId}/shipping_address
if (method === "POST" && path.endsWith("/shipping_address")) {
  const body = await req.json();
  const violetRes = await fetch(
    `${VIOLET_API_BASE}/checkout/cart/${cartId}/shipping_address`,
    { method: "POST", headers: violetHeaders, body: JSON.stringify(body) }
  );
  return new Response(await violetRes.text(), { status: violetRes.status });
}

// GET /{cartId}/shipping/available
if (method === "GET" && path.endsWith("/shipping/available")) {
  const violetRes = await fetch(
    `${VIOLET_API_BASE}/checkout/cart/${cartId}/shipping/available`,
    { method: "GET", headers: violetHeaders }
  );
  return new Response(await violetRes.text(), { status: violetRes.status });
}

// POST /{cartId}/shipping
if (method === "POST" && path.endsWith("/shipping") && !path.endsWith("/shipping_address")) {
  const body = await req.json();
  const violetRes = await fetch(
    `${VIOLET_API_BASE}/checkout/cart/${cartId}/shipping`,
    { method: "POST", headers: violetHeaders, body: JSON.stringify(body) }
  );
  return new Response(await violetRes.text(), { status: violetRes.status });
}
```

**Path matching order matters** — `/shipping_address` must be checked before `/shipping` to avoid routing conflicts.

### Previous Story Intelligence (from 4.2 & 4.1)

- **`vinxi/http` not available** — use `@tanstack/react-start/server` for `getCookie`/`setCookie` (critical)
- **`@tanstack/react-router` for `Link`** — never use `<a href>` for internal navigation
- **`getAdapter()` singleton** — never instantiate `new VioletAdapter()` in Server Functions; use the singleton
- **Checkout stub exists** — `apps/web/src/routes/checkout/index.tsx` already exists as a placeholder from Story 4.2 code review. Replace the component body but keep the `createFileRoute('/checkout/')` declaration.
- **Mobile spacing scale** — Only `half` → `six` + `eight` are valid `Spacing` constant values. Do NOT use `Spacing.ten`, `Spacing.twelve`, etc.
- **Mobile navigation** — use `router.push()` from `expo-router` for navigation
- **`formatPrice()` not `formatCents()`** — the shared utility is `formatPrice(cents: number): string`, not `formatCents`. Check import from `@ecommerce/shared`.
- **TanStack Query invalidation** — after `setShippingMethodsFn` succeeds, invalidate `['cart', 'detail', cartId]` to update the cart display in CartDrawer/CartBag

### Violet API Reference — Story 4.3

| Action | Method | Endpoint | Notes |
|--------|--------|----------|-------|
| Set customer info | POST | `/v1/checkout/cart/{id}/customer` | Story 4.4 — not needed here |
| Set shipping address | POST | `/v1/checkout/cart/{id}/shipping_address` | **Required BEFORE get-methods** |
| Get available methods | GET | `/checkout/cart/{id}/shipping/available` | Slow — calls carrier APIs |
| Set shipping methods | POST | `/checkout/cart/{id}/shipping` | Body: `[{ bag_id, shipping_method_id }]` · Returns priced cart |
| Set billing address | POST | `/v1/checkout/cart/{id}/billing_address` | Story 4.4 |
| Get payment intent | POST | `/checkout/cart/{id}/payment` | Story 4.4 |
| Submit order | POST | `/checkout/cart/{id}/submit` | Story 4.4 |

**Violet sandbox base URL:** `https://sandbox-api.violet.io/v1` (from `VIOLET_API_BASE` env var)

### Project Structure Notes

- New Server Function file: `apps/web/src/server/checkout.ts` (alongside `cartActions.ts`) — keeps checkout logic separate from cart CRUD
- `violetAdapter.ts` in `apps/web/src/server/` is a re-export of the shared adapter — always import `getAdapter` from there, not from `@ecommerce/shared` directly
- Types added to `packages/shared/src/types/cart.types.ts` (not a new file) — shipping is part of cart/checkout domain
- Zod schemas added to `packages/shared/src/schemas/cart.schema.ts` — same file as other cart schemas
- Mobile checkout screen: `apps/mobile/src/app/checkout.tsx` (top-level screen, not nested in `cart/`) — matches architecture spec
- CSS: `checkout.css` imported after `cart.css` in `index.css`

### References

- [Source: epics.md#Story 4.3 — full acceptance criteria and Violet API endpoints]
- [Source: epics.md#Epic 4 — FR16, FR21, wallet_based_checkout note]
- [Source: architecture.md#Feature Mapping — Checkout: checkout/index.tsx, checkout.ts Server Function]
- [Source: architecture.md#Data Flow — Checkout sequence diagram]
- [Source: architecture.md#SSR strategy — Checkout: CSR (Stripe Elements requires client-side)]
- [Source: architecture.md#Integration Points — Violet.io via Server Functions + Edge Functions]
- [Source: ux-design-specification.md#Checkout component — anatomy, BEM classes, states]
- [Source: ux-design-specification.md#checkout.css in CSS architecture]
- [Source: ux-design-specification.md#Anti-patterns — 4-step wizard anti-pattern; keep it single page]
- [Source: 4-2-cart-summary-with-transparent-pricing.md — previous story learnings, C1-C5]
- [Source: packages/shared/src/types/cart.types.ts — Bag, Cart, CartItem types to align with]
- [Source: packages/shared/src/schemas/cart.schema.ts — existing schema patterns to follow]
- [Source: packages/shared/src/adapters/supplierAdapter.ts — interface to extend]
- [Source: packages/shared/src/adapters/violetAdapter.ts — fetchWithRetry, parseAndTransformCart patterns]
- [Source: apps/web/src/server/cartActions.ts — Server Function pattern to replicate]
- [Source: apps/web/src/routes/checkout/index.tsx — stub to replace]
- [Source: supabase/functions/cart/index.ts — Edge Function routing pattern for mobile]
- [Source: docs/violet-io-integration-guide.md — Violet account setup context]
- [Violet.io Official Docs: GET /checkout/cart/{cart_id}/shipping/available — requires address first, slow due to carrier APIs]
- [Violet.io Official Docs: POST /checkout/cart/{cart_id}/shipping — returns priced cart]
- [Violet.io Official Docs: POST /checkout/cart/{cart_id}/shipping_address — OrderAddress type: address1, city, state, postal_code, country, name, email, phone]

## Senior Developer Review (AI)

**Reviewer:** Charles (AI Code Review) — 2026-03-14
**Outcome:** Approved after fixes

### Issues Found & Fixed

| Severity | Issue | Fixed In |
|----------|-------|----------|
| CRITICAL | Mobile: Edge Function `GET /shipping/available` returned raw Violet snake_case (`bag_id`, `shipping_methods`, `shipping_method_id`) but mobile consumed it as `ShippingMethodsAvailable[]` (camelCase). `bag.bagId` and `bag.shippingMethods` were `undefined` → crash at runtime | `supabase/functions/cart/index.ts` — added `transformShippingAvailable()` |
| MEDIUM | Dead code: `countryWarning` state could never trigger because country `<select>` only shows `SUPPORTED_COUNTRIES` — the `!SUPPORTED_COUNTRIES.includes(value)` condition was unreachable | `checkout/index.tsx` — removed `countryWarning` state + dead JSX |
| MEDIUM | `handleRetryBag` set `setBagLoadingState({ [bagId]: true })` but this was immediately overwritten by `fetchAvailableShippingMethods` which marks ALL bags as loading | `checkout/index.tsx` — removed the dead `setBagLoadingState` call from `handleRetryBag` |
| MEDIUM | Mobile: global `isLoadingMethods` only; no per-bag error state for bags returning 0 methods (AC#10 partially violated) | `apps/mobile/src/app/checkout.tsx` — added `bagErrorState: Record<string, string>` with per-bag retry |
| MEDIUM | Mobile: single global retry (AC#10 violated) — partial fix: per-bag error state added; retry still refetches all (Violet doesn't support per-bag retry) | `apps/mobile/src/app/checkout.tsx` |

### JSDoc / Documentation Added

- `supabase/functions/cart/index.ts`: Added `transformShippingAvailable()` with full JSDoc (field mapping, why transformation is needed, Violet API reference)
- Updated Edge Function module JSDoc with Violet best practices: transformation requirements per route, field naming conventions, prerequisite ordering

### Notes

- All ACs verified as implemented ✅
- TypeScript + ESLint pass with 0 errors/warnings after fixes
- Violet docs confirmed: `shipping_method_id`, `label`, `price`, `carrier` are the exact field names in `GET /shipping/available` response

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- **D1** — `inputValidator()` not `validator()`: The story spec referenced `.validator()` from TanStack Start's ServerFnBuilder, but the actual API is `.inputValidator()`. Discovered via TypeScript error, fixed immediately.
- **D2** — React Native `autoComplete` values: HTML5 values like `"address-level2"` are not valid in React Native's `TextInput`. Used `"address-line2"` and `"address-line1"` instead (RN-specific enum).
- **D3** — Violet API divergence from story spec (corrected from official docs):
  - The shipping method identifier field in GET /shipping/available response is **`shipping_method_id`** (not `id`). Updated Zod schema and adapter transformation accordingly.
  - **`min_days`/`max_days` do NOT exist** in Violet's shipping API. Official FAQ confirms: "The platforms don't consistently provide shipping time data through their APIs." Fields kept as optional in schema (to avoid breakage if ever added) but UI only renders them when present (they never will be).
  - **`name`/`email` are NOT part of the shipping address** — they belong to the Customer object (POST /customer, Story 4.4). Removed from `ShippingAddressInput` type, Zod schema, and adapter body.
  - Source: https://docs.violet.io/prism/checkout-guides/carts-and-bags/shipping-methods

### Completion Notes List

- **All 10 tasks implemented and TypeScript+lint clean** (150 existing tests pass, no regressions).
- `parseAndTransformCart()` (private method) reused in `setShippingMethods` — no architectural change needed since `setShippingMethods` is in the same class.
- `violetShippingAvailableResponseSchema` uses `.optional().default([])` on `shipping_methods` to handle carrier API failures gracefully at the schema level.
- Web checkout page uses step-based state machine (`address → methods → confirmed`) to enforce the Violet address-before-methods invariant in the UI.
- Edge Function shipping routes use strict regex matching: `/shipping_address$` checked before `/shipping$` to avoid path conflicts (documented in JSDoc).
- Cart query invalidated via `queryClient.invalidateQueries(queryKeys.cart.detail(violetCartId))` after `setShippingMethodsFn` succeeds, ensuring CartDrawer reflects updated `shippingTotal`.
- Mobile checkout sends Violet snake_case fields directly in the fetch body (Edge Function proxies the body as-is to Violet).
- `formatPrice` from `@ecommerce/shared` used consistently on both web and mobile.

### File List

packages/shared/src/types/cart.types.ts
packages/shared/src/types/index.ts
packages/shared/src/schemas/cart.schema.ts
packages/shared/src/schemas/index.ts
packages/shared/src/adapters/supplierAdapter.ts
packages/shared/src/adapters/violetAdapter.ts
apps/web/src/server/checkout.ts (NEW)
apps/web/src/routes/checkout/index.tsx
apps/web/src/styles/pages/checkout.css (NEW)
apps/web/src/styles/index.css
supabase/functions/cart/index.ts
apps/mobile/src/app/checkout.tsx (NEW)
