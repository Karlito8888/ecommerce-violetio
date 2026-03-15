# Story 4.5: Payment Confirmation & 3D Secure Handling

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Quick Reference — Files to Create/Update

| Action | File | Notes |
| ------ | ---- | ----- |
| REWRITE | `apps/web/src/routes/order/$orderId/confirmation.tsx` | Replace stub with full confirmation UI (order summary, items, totals, delivery estimate) |
| CREATE | `apps/web/src/styles/pages/confirmation.css` | BEM styles for the "wow moment" confirmation page (editorial warmth per UX spec) |
| UPDATE | `apps/web/src/routes/checkout/index.tsx` | Harden 3DS flow: improve error messages, add cart clearing on success, handle edge cases |
| UPDATE | `apps/web/src/server/checkout.ts` | Add `getOrderDetailsFn` Server Function to fetch order data for confirmation page |
| UPDATE | `packages/shared/src/adapters/supplierAdapter.ts` | Add `getOrder(orderId)` method signature |
| UPDATE | `packages/shared/src/adapters/violetAdapter.ts` | Implement `getOrder(orderId)` — GET /orders/{id} |
| UPDATE | `packages/shared/src/types/order.types.ts` | Add `OrderDetail` type with bags, items, totals, shipping info |
| UPDATE | `packages/shared/src/schemas/cart.schema.ts` | Add `violetOrderResponseSchema` for parsing GET /orders/{id} response |
| UPDATE | `apps/mobile/src/app/checkout.tsx` | Navigate to confirmation screen instead of home; harden 3DS error UX |
| CREATE | `apps/mobile/src/app/order/[orderId]/confirmation.tsx` | Mobile confirmation screen with order summary |
| UPDATE | `supabase/functions/cart/index.ts` | Add GET /orders/{id} proxy route for mobile |
| UPDATE | `apps/web/src/styles/index.css` | Add `@import "./pages/confirmation.css"` |

---

## Story

As a **visitor**,
I want my payment to be securely processed with 3D Secure when required and to see a clear order confirmation,
so that my purchase is protected and I receive clear confirmation of what I ordered.

## Acceptance Criteria

1. **Given** a visitor submits checkout
   **When** Stripe requires 3D Secure authentication
   **Then** the Stripe Payment Element handles the 3DS challenge flow automatically
   **And** web: `stripe.confirmPayment()` opens the 3DS modal natively via Stripe.js
   **And** mobile: Stripe React Native SDK handles 3DS in-app via PaymentSheet

2. **When** payment succeeds (status `COMPLETED` from Violet `/submit`)
   **Then** the visitor is redirected to an order confirmation page/screen
   **And** the confirmation displays: order ID, items purchased per merchant, total paid, estimated delivery (FR22)
   **And** the cart is cleared from local state (cookie/SecureStore) and query cache

3. **And** web: confirmation page at `app/routes/order/$orderId/confirmation.tsx`
   **And** mobile: confirmation screen at `app/order/[orderId]/confirmation.tsx`

4. **When** payment fails
   **Then** the visitor stays on the checkout page with a clear, human-readable error message
   **And** the visitor can retry with a different payment method without losing form data (FR19)
   **And** the cart and address data are preserved

5. **And** all Violet 200-with-errors responses are checked and bag-level errors are surfaced clearly

6. **And** the confirmation page is the "Post-Purchase Wow Moment" — editorial warmth per UX spec, not a generic receipt

7. **And** the confirmation page is accessible via direct URL (bookmarkable, shareable) by fetching order data from Violet via Server Function

## Tasks / Subtasks

- [x] Task 1: Add `OrderDetail` type and `getOrder` adapter method (AC: #2, #7)
  - [x] Add `OrderDetail` interface to `order.types.ts`:
    ```typescript
    export interface OrderBagItem {
      skuId: string;
      name: string;
      quantity: number;
      price: number;        // cents
      linePrice: number;    // cents (price × quantity)
      thumbnail?: string;
    }
    export interface OrderBag {
      id: string;
      merchantName: string;
      status: string;
      financialStatus: string;
      items: OrderBagItem[];
      subtotal: number;
      shippingTotal: number;
      taxTotal: number;
      total: number;
      shippingMethod?: { carrier: string; label: string };
    }
    export interface OrderDetail {
      id: string;
      status: OrderStatus;
      currency: string;
      subtotal: number;
      shippingTotal: number;
      taxTotal: number;
      total: number;
      bags: OrderBag[];
      customer: { email: string; firstName: string; lastName: string };
      shippingAddress: {
        address1: string;
        city: string;
        state: string;
        postalCode: string;
        country: string;
      };
      dateSubmitted?: string;
    }
    ```
  - [x] Export from `types/index.ts`
  - [x] Add `violetOrderResponseSchema` to `cart.schema.ts` (or a new `order.schema.ts`)
  - [x] Add `getOrder(orderId: string): Promise<ApiResponse<OrderDetail>>` to `supplierAdapter.ts`
  - [x] Implement `getOrder` in `violetAdapter.ts`: `GET /orders/{orderId}`

- [x] Task 2: Add `getOrderDetailsFn` Server Function (AC: #7)
  - [x] In `apps/web/src/server/checkout.ts`:
    ```typescript
    export const getOrderDetailsFn = createServerFn({ method: "GET" })
      .inputValidator((data: { orderId: string }) => data)
      .handler(async ({ data }) => {
        return getAdapter().getOrder(data.orderId);
      });
    ```
  - [x] Note: this endpoint does NOT require `violet_cart_id` cookie — uses `orderId` directly

- [x] Task 3: Build confirmation page — web (AC: #2, #3, #6, #7)
  - [x] Rewrite `apps/web/src/routes/order/$orderId/confirmation.tsx`:
    - Add `loader` using `getOrderDetailsFn` to fetch order by `orderId` param
    - Handle loading state (skeleton), error state (order not found), and success state
    - Display: order ID, date, status badge
    - Per-bag section: merchant name, items (thumbnail, name, qty, price), bag subtotal, shipping method
    - Price breakdown: subtotal, shipping, tax, total — reuse `formatPrice()` from `@ecommerce/shared`
    - Shipping address summary
    - "Continue Shopping" CTA button → `/`
    - "Track your order" placeholder text (Story 5.3 will implement tracking)
  - [x] Apply editorial warmth design per UX spec: generous whitespace, warm typography, success color accents
  - [x] Use `createFileRoute('/order/$orderId/confirmation')` with `loader` (this page CAN be SSR since no Stripe dependency)

- [x] Task 4: Create confirmation.css (AC: #6)
  - [x] Create `apps/web/src/styles/pages/confirmation.css` with BEM blocks:
    - `.confirmation` — page container, editorial warmth layout
    - `.confirmation__header` — success icon/checkmark + "Order Confirmed!" heading
    - `.confirmation__order-id` — order ID and date display
    - `.confirmation__bag` — per-merchant section card
    - `.confirmation__bag-header` — merchant name
    - `.confirmation__item` — item row (thumbnail, name, qty, price)
    - `.confirmation__item-image` — thumbnail image
    - `.confirmation__pricing` — price breakdown section
    - `.confirmation__pricing-row` — subtotal/shipping/tax/total rows
    - `.confirmation__pricing-row--total` — bold total row
    - `.confirmation__address` — shipping address summary
    - `.confirmation__actions` — CTA buttons section
  - [x] Add `@import "./pages/confirmation.css"` to `apps/web/src/styles/index.css` (after checkout.css import)
  - [x] Use design tokens: `--color-success` for confirmation accents, `--font-display` for headings, generous `--spacing-*`

- [x] Task 5: Harden 3DS flow in checkout — web (AC: #1, #4, #5)
  - [x] In `apps/web/src/routes/checkout/index.tsx`:
    - Verify `handlePlaceOrder` correctly handles all REQUIRES_ACTION edge cases
    - After COMPLETED: ensure `clearCartCookieFn()` is called before navigation
    - After COMPLETED: invalidate cart query cache `['cart', 'detail']`
    - Improve error messages: map Stripe error codes to human-readable French/English messages
    - Handle `CANCELED` status from Violet (new state — distinct from REJECTED)
    - Ensure form data preservation on ANY error (AC #4)
    - Ensure the appOrderId ref persists across 3DS retry cycles
  - [x] Test scenario: REQUIRES_ACTION → handleNextAction → re-submit → COMPLETED → redirect to confirmation

- [x] Task 6: Harden 3DS flow in checkout — mobile (AC: #1, #4)
  - [x] In `apps/mobile/src/app/checkout.tsx`:
    - Update success navigation: `router.push("/order/{orderId}/confirmation")` instead of `router.push("/")`
    - Improve REQUIRES_ACTION error message: "Additional verification was required. Your payment may still be processing. Please check your email for confirmation."
    - Ensure `SecureStore.deleteItemAsync("violet_cart_id")` on success
    - Handle Stripe PaymentSheet errors with user-friendly messages

- [x] Task 7: Build confirmation screen — mobile (AC: #2, #3)
  - [x] Create `apps/mobile/src/app/order/[orderId]/confirmation.tsx`:
    - Fetch order data from Edge Function: `GET /orders/{orderId}`
    - Use `useLocalSearchParams<{ orderId: string }>()` for route params
    - Display same info as web: order ID, items per merchant, totals, address
    - Use mobile design patterns: `ScrollView`, spacing constants (`Spacing.two`, `Spacing.four`), `ThemedText`
    - "Continue Shopping" button → `router.push("/")`
    - Loading skeleton while fetching

- [x] Task 8: Add mobile Edge Function route for order details (AC: #7)
  - [x] In `supabase/functions/cart/index.ts`:
    - Add `GET /orders/{orderId}` route
    - Forward to Violet `GET /orders/{orderId}` with auth headers
    - Return parsed order response

- [x] Task 9: Cart clearing and state cleanup (AC: #2)
  - [x] Web: after successful submit, before navigation:
    1. Call `clearCartCookieFn()` (already exists from Story 4.4)
    2. Invalidate TanStack Query cache: `queryClient.invalidateQueries({ queryKey: ['cart'] })`
    3. Navigate to confirmation
  - [x] Mobile: after successful submit, before navigation:
    1. `await SecureStore.deleteItemAsync("violet_cart_id")`
    2. Navigate to confirmation
  - [x] Ensure NO stale cart state remains after successful order

## Dev Notes

### Critical Architecture Constraints

- **Confirmation page CAN use SSR** — Unlike the checkout page (which needs Stripe.js client-side), the confirmation page has no client-side payment dependency. Use a `loader` with `getOrderDetailsFn` to fetch order data server-side for faster render and better SEO.

- **Violet GET /orders/{id} endpoint** — Returns complete order with bags, items, totals, customer, addresses. This is NOT the same as GET /checkout/cart/{id}. After submission, the cart becomes an order and should be accessed via the orders endpoint.

- **3DS is ALREADY implemented in Story 4.4** — The `handlePlaceOrder` function in checkout already handles REQUIRES_ACTION → `handleNextAction()` → re-submit. Story 4.5's job is to HARDEN this flow (better error messages, edge cases) and build the confirmation destination.

- **`stripe.confirmPayment()` does NOT charge** — It only authorizes. The card is charged on successful `/submit`. If submit fails after confirmPayment, the auth falls off in a few business days. This is critical for error messaging: "Your card was not charged" is accurate for submit failures.

- **Order states from Violet (official docs confirmed):**
  - `IN_PROGRESS` → `PROCESSING` → `COMPLETED` (happy path)
  - `IN_PROGRESS` → `PROCESSING` → `REQUIRES_ACTION` → (3DS) → `PROCESSING` → `COMPLETED`
  - `IN_PROGRESS` → `PROCESSING` → `REJECTED` (payment failed permanently)
  - `IN_PROGRESS` → `PROCESSING` → `CANCELED` (merchant canceled)

- **Bag states (independent per merchant):**
  - `IN_PROGRESS` → `SUBMITTED` → `ACCEPTED` → `COMPLETED` (happy path)
  - `ACCEPTED` → `BACKORDERED`, `PARTIALLY_REFUNDED`, `REFUNDED`, `CANCELED`, `REJECTED`
  - Mixed states are possible: one bag ACCEPTED, another REJECTED within same order

- **200-with-errors pattern** — Violet can return HTTP 200 with an `errors[]` array. ALWAYS check this array. Multi-bag orders can have partial failures (some bags accepted, others rejected).

- **`payment_intent_client_secret` lifecycle** — Created at cart creation (with `wallet_based_checkout: true`), automatically updated by Violet as totals change, persists through the order lifecycle. Used for REQUIRES_ACTION re-authentication.

- **Cart cookie clearing** — `clearCartCookieFn` (Story 4.4) clears the `violet_cart_id` HttpOnly cookie. Must be called BEFORE navigation to confirmation, otherwise a stale cart could be used for a new order.

### C1 — Violet GET /orders/{id} response structure (from official docs)

```json
{
  "id": 12345,
  "status": "COMPLETED",
  "payment_status": "CAPTURED",
  "currency": "USD",
  "sub_total": 4999,
  "shipping_total": 599,
  "tax_total": 300,
  "total": 5898,
  "date_submitted": "2026-03-15T10:30:00Z",
  "customer": {
    "first_name": "John",
    "last_name": "Doe",
    "email": "john@example.com"
  },
  "shipping_address": {
    "address_1": "123 Main St",
    "city": "New York",
    "state": "NY",
    "postal_code": "10001",
    "country": "US"
  },
  "bags": [
    {
      "id": 999,
      "merchant_id": 42,
      "merchant_name": "Cool Merchant",
      "status": "ACCEPTED",
      "financial_status": "PAID",
      "sub_total": 4999,
      "shipping_total": 599,
      "tax_total": 300,
      "total": 5898,
      "shipping_method": {
        "carrier": "USPS",
        "label": "Priority Mail",
        "price": 599
      },
      "skus": [
        {
          "id": 789,
          "name": "Premium Widget",
          "quantity": 1,
          "price": 4999,
          "line_price": 4999,
          "thumbnail": "https://..."
        }
      ]
    }
  ],
  "errors": []
}
```

### C2 — Confirmation page loader pattern (web)

```typescript
import { createFileRoute } from "@tanstack/react-router";
import { getOrderDetailsFn } from "#/server/checkout";

export const Route = createFileRoute("/order/$orderId/confirmation")({
  loader: async ({ params }) => {
    return getOrderDetailsFn({ data: { orderId: params.orderId } });
  },
  component: OrderConfirmation,
});

function OrderConfirmation() {
  const orderResult = Route.useLoaderData();
  // Handle loading/error/success states
}
```

### C3 — getOrder implementation in violetAdapter.ts

```typescript
async getOrder(orderId: string): Promise<ApiResponse<OrderDetail>> {
  const result = await this.fetchWithRetry(
    `${this.apiBase}/orders/${orderId}`,
    { method: "GET" }
  );
  if (result.error) return { data: null, error: result.error };

  const data = result.data as Record<string, unknown>;

  // Check 200-with-errors
  if (Array.isArray(data.errors) && data.errors.length > 0) {
    return { data: null, error: { code: "VIOLET.ORDER_ERROR", message: "Order has errors", details: data.errors } };
  }

  const bags = (data.bags as Array<Record<string, unknown>> ?? []).map(bag => ({
    id: String(bag.id ?? ""),
    merchantName: String(bag.merchant_name ?? ""),
    status: String(bag.status ?? ""),
    financialStatus: String(bag.financial_status ?? ""),
    items: ((bag.skus as Array<Record<string, unknown>>) ?? []).map(sku => ({
      skuId: String(sku.id ?? ""),
      name: String(sku.name ?? ""),
      quantity: Number(sku.quantity ?? 0),
      price: Number(sku.price ?? 0),
      linePrice: Number(sku.line_price ?? 0),
      thumbnail: sku.thumbnail as string | undefined,
    })),
    subtotal: Number(bag.sub_total ?? 0),
    shippingTotal: Number(bag.shipping_total ?? 0),
    taxTotal: Number(bag.tax_total ?? 0),
    total: Number(bag.total ?? 0),
    shippingMethod: bag.shipping_method ? {
      carrier: String((bag.shipping_method as Record<string, unknown>).carrier ?? ""),
      label: String((bag.shipping_method as Record<string, unknown>).label ?? ""),
    } : undefined,
  }));

  const customer = data.customer as Record<string, unknown> ?? {};
  const shippingAddr = data.shipping_address as Record<string, unknown> ?? {};

  return {
    data: {
      id: String(data.id ?? ""),
      status: (data.status ?? "COMPLETED") as OrderStatus,
      currency: String(data.currency ?? "USD"),
      subtotal: Number(data.sub_total ?? 0),
      shippingTotal: Number(data.shipping_total ?? 0),
      taxTotal: Number(data.tax_total ?? 0),
      total: Number(data.total ?? 0),
      bags,
      customer: {
        email: String(customer.email ?? ""),
        firstName: String(customer.first_name ?? ""),
        lastName: String(customer.last_name ?? ""),
      },
      shippingAddress: {
        address1: String(shippingAddr.address_1 ?? ""),
        city: String(shippingAddr.city ?? ""),
        state: String(shippingAddr.state ?? ""),
        postalCode: String(shippingAddr.postal_code ?? ""),
        country: String(shippingAddr.country ?? ""),
      },
      dateSubmitted: data.date_submitted as string | undefined,
    },
    error: null,
  };
}
```

### C4 — 3DS error message mapping

```typescript
function getStripeErrorMessage(error: StripeError): string {
  switch (error.code) {
    case "card_declined":
      return "Your card was declined. Please try a different payment method.";
    case "expired_card":
      return "Your card has expired. Please use a different card.";
    case "incorrect_cvc":
      return "The security code is incorrect. Please check and try again.";
    case "processing_error":
      return "A processing error occurred. Please try again.";
    case "authentication_required":
      return "Additional authentication is required. Please complete the verification.";
    default:
      return error.message ?? "Payment could not be processed. Please try again.";
  }
}
```

### C5 — UX design requirements for confirmation page (from UX spec)

- **Editorial warmth mode** — The confirmation page switches from "search-forward" (checkout) to "editorial" (post-purchase)
- **"Post-Purchase Wow Moment"** — "Instead of a generic receipt, a polished confirmation with clear order summary, tracking info, and a memorable brand moment"
- **Color**: Use `--color-success` (#5A7A4A) for confirmation accents (checkmark, status badges)
- **Typography**: `--font-display` (Cormorant Garamond) for the "Order Confirmed!" heading, `--font-body` (Inter) for details
- **Layout**: Generous whitespace, clean summary, no clutter
- **No dark patterns**: No "rate us 5 stars!", no "share on social media!", no forced account creation prompt
- **Gentle retention**: "Continue Shopping" CTA, subtle "Track your order" link
- **CSS file reference**: `confirmation.css` per UX spec CSS architecture
- **Emotional payoff**: "Your order is confirmed" — reassuring, not celebratory-spam
- **Confirmation announced as heading-level change** for accessibility (`aria-live` region)

### C6 — Confirmation page dark mode support

Follow the same pattern as other pages: use CSS custom properties from `tokens.css`. The `[data-theme="dark"]` selector handles dark mode. No additional dark mode logic needed — just use the existing design token variables (`--color-bg-primary`, `--color-text-primary`, `--color-success`, etc.).

### Previous Story Intelligence (from Story 4.4)

- **`inputValidator` NOT `validator`** — TanStack Start uses `.inputValidator()` on ServerFnBuilder
- **`vinxi/http` NOT available** — use `@tanstack/react-start/server` for `getCookie`
- **`getAdapter()` singleton** — never `new VioletAdapter()` in Server Functions
- **`formatPrice(cents)` from `@ecommerce/shared`** — not `formatCents`, not `(price / 100).toFixed(2)`
- **TanStack Router `useNavigate()`** — for client-side navigation
- **Violet 200-with-errors** — always check `errors[]` array even on HTTP 200
- **`@tanstack/react-router` for `<Link>`** — never `<a href>` for internal navigation
- **Cart query invalidation** — invalidate `['cart', 'detail', violetCartId]` or `['cart']`
- **CSR checkout + SSR confirmation** — checkout has NO loader (Stripe.js), but confirmation CAN have a loader
- **`loadStripe()` at module level** — prevents Stripe re-instantiation
- **appOrderId via useRef** — persists across re-renders for idempotency
- **Mobile: `router.push()` from `expo-router`** — for navigation
- **Mobile: spacing scale** — only `half` → `six` + `eight` are valid `Spacing` constants
- **`clearCartCookieFn`** — already exists from Story 4.4, clears `violet_cart_id` cookie
- **D1 from 4.4**: TypeScript narrowing — avoid redundant type checks inside already-narrowed blocks
- **D2 from 4.4**: Route tree regeneration — new routes require vite dev server start to trigger auto-gen

### Git Intelligence (from recent commits)

- Latest commit: `06bfbed feat: implement one-step checkout with Stripe payment (Story 4.4) + code review fixes`
- Pattern: Stories create/update files across shared types, adapters, server functions, route components, CSS, and Edge Functions
- Code review fixes are applied in same commit
- BEM naming strictly followed in CSS

### Violet API Reference — Story 4.5

| Action | Method | Endpoint | Notes |
| ------ | ------ | -------- | ----- |
| Get order details | GET | `/v1/orders/{orderId}` | Returns full order with bags, items, customer, address, totals |
| Submit cart (existing) | POST | `/v1/checkout/cart/{id}/submit` | `{ app_order_id }` — already implemented in Story 4.4 |
| Clear cart cookie | — | `clearCartCookieFn` | Server Function from Story 4.4 |

**Violet order response confirmed fields (official docs):**
- `id`, `status`, `payment_status`, `currency`
- `sub_total`, `shipping_total`, `tax_total`, `discount_total`, `total` (all cents)
- `customer`: `{ first_name, last_name, email }`
- `shipping_address`: `{ address_1, address_2, city, state, country, postal_code }`
- `bags[]`: `{ id, merchant_id, merchant_name, status, financial_status, skus[], shipping_method, sub_total, shipping_total, tax_total, total }`
- `bags[].skus[]`: `{ id, name, quantity, price, line_price, thumbnail }`
- `bags[].shipping_method`: `{ carrier, label, price }`
- `date_submitted`: ISO 8601 datetime
- `errors[]`: always check, even on 200

### Violet 3DS Flow (from official Stripe.js v3 guide, confirmed 2026-03-15)

1. Create cart with `wallet_based_checkout: true` → get `payment_intent_client_secret`
2. Render Stripe PaymentElement with `clientSecret`
3. User clicks "Place Order" → `stripe.confirmPayment({ elements, redirect: "if_required" })`
4. If Stripe success → `POST /checkout/cart/{id}/submit` with `{ app_order_id }`
5. If Violet returns `status: "REQUIRES_ACTION"`:
   - Response includes `payment_intent_client_secret`
   - Call `stripe.handleNextAction({ clientSecret: response.payment_intent_client_secret })`
   - After 3DS challenge resolves → re-call `/submit` with SAME `app_order_id`
6. If `status: "COMPLETED"` → clear cart → navigate to confirmation
7. If `status: "REJECTED"` → show error, preserve form data

**Key from docs**: `stripe.confirmPayment()` only authorizes — it does NOT charge. The charge happens on successful `/submit`. So for REQUIRES_ACTION failures, the user was NOT charged.

### Project Structure Notes

- Confirmation page: `apps/web/src/routes/order/$orderId/confirmation.tsx` (already exists as stub)
- Confirmation CSS: `apps/web/src/styles/pages/confirmation.css` (new — referenced in UX spec CSS architecture)
- Mobile confirmation: `apps/mobile/src/app/order/[orderId]/confirmation.tsx` (new)
- Server functions: `apps/web/src/server/checkout.ts` (add `getOrderDetailsFn`)
- Types: `packages/shared/src/types/order.types.ts` (add `OrderDetail`, `OrderBag`, `OrderBagItem`)
- Adapter: `packages/shared/src/adapters/violetAdapter.ts` (add `getOrder`)

### References

- [Source: epics.md#Story 4.5 — Payment Confirmation & 3D Secure Handling acceptance criteria]
- [Source: epics.md#Story 5.1 — Order Confirmation & Data Persistence (deferred: email, guest token, data persistence)]
- [Source: architecture.md#Checkout Data Flow — confirmPayment → 3DS → handleNextAction → submit → webhook]
- [Source: architecture.md#SSR Strategy — Checkout: CSR (Stripe), Confirmation: SSR possible]
- [Source: ux-design-specification.md#Post-Purchase Wow — editorial warmth, clean summary, no dark patterns]
- [Source: ux-design-specification.md#CSS Architecture — confirmation.css in styles/pages/]
- [Source: ux-design-specification.md#Emotional Journey — Stage 5: Delight + Reassurance]
- [Source: ux-design-specification.md#Checkout Component — payment success → redirect to confirmation]
- [Source: ux-design-specification.md#Error Recovery — 3DS flow, decline errors, timeout handling]
- [Source: 4-4-one-step-checkout-with-stripe-payment.md — Complete 3DS implementation, server functions, patterns]
- [Violet.io Official Docs: Order and Bag States — IN_PROGRESS → PROCESSING → REQUIRES_ACTION → COMPLETED]
- [Violet.io Official Docs: Checkout with Stripe.js v3 — confirmPayment → handleNextAction → submit flow]
- [Violet.io Official Docs: Cart Lifecycle — Pre-Submission → Submission → Post-Submission]
- [Violet.io Official Docs: Submit Cart — POST /checkout/cart/{id}/submit response with bags, errors, status]
- [Violet.io Official Docs: GET /orders/{id} — Full order response with bags, skus, customer, addresses]
- [Violet.io Official Docs: 200-with-errors — Always check errors[] regardless of HTTP status]
- [Violet.io Official Docs: wallet_based_checkout — payment_intent_client_secret auto-updated by Violet as totals change]

## Dev Agent Record

### Agent Model Used

claude-opus-4-6

### Debug Log References

- D1: TS2353 — `ApiError` type does not have a `details` field. Fixed by extracting first error message from Violet's `errors[]` array into the `message` field instead.

### Completion Notes List

- Task 1: Added `OrderDetail`, `OrderBag`, `OrderBagItem` types to order.types.ts with comprehensive JSDoc. Updated `SupplierAdapter.getOrder()` return type from `Order` to `OrderDetail`. Implemented `getOrder()` in VioletAdapter with full snake_case → camelCase transformation and 200-with-errors checking.
- Task 2: Added `getOrderDetailsFn` Server Function in checkout.ts. Uses orderId param (NOT violet_cart_id cookie) — the confirmation page works even after cart cookie is cleared.
- Task 3: Rewrote confirmation page with SSR `loader`, order summary with per-merchant bags, item thumbnails, price breakdown, shipping address, and "Continue Shopping" CTA. Uses `formatPrice()` from shared package.
- Task 4: Created confirmation.css with BEM blocks for editorial warmth design. Uses `--font-display` (Cormorant Garamond) for heading, `--color-success` for accents, generous whitespace. Includes responsive styles, skeleton loading, and error state.
- Task 5: Hardened web 3DS flow: added `getStripeErrorMessage()` for human-readable Stripe error mapping, added CANCELED status handling in both initial submit and 3DS retry paths, improved error messaging.
- Task 6: Hardened mobile 3DS flow: improved REQUIRES_ACTION error message, added CANCELED status handling, updated success path to clear SecureStore and navigate to confirmation screen.
- Task 7: Created mobile confirmation screen at `app/order/[orderId]/confirmation.tsx` with Edge Function fetch, per-merchant bags, price breakdown, shipping address. Created `order/_layout.tsx` Stack navigator.
- Task 8: Added `GET /orders/{orderId}` route to Edge Function with `transformOrder()` function for snake_case → camelCase transformation. Updated route table JSDoc.
- Task 9: Cart clearing already handled — web uses `clearCartCookieFn()` + query invalidation (Task 5), mobile uses `SecureStore.deleteItemAsync()` (Task 6). Both execute before navigation to confirmation.

### Change Log

- 2026-03-15: Story 4.5 implementation — payment confirmation page + 3DS hardening (9 tasks completed)
- 2026-03-15: Code review — 7 issues found (2 HIGH, 5 MEDIUM), all fixed:
  - H1: Mobile confirmation missing Authorization header → added getSessionToken + Bearer header
  - H2: getOrderDetailsFn has no ownership validation → documented as known limitation (TODO Story 5.1)
  - M1: OrderStatus missing ACCEPTED state → added from official Violet docs (7 states total)
  - M2: Mobile formatCents duplicated formatPrice → replaced with shared formatPrice import
  - M3: Inline styles in BagCard → extracted to BEM classes (.confirmation__bag-shipping)
  - M4: BagStatus type outdated → updated to match official Violet docs (8 states)
  - M5: Missing aria-live region → added aria-live="polite" to confirmation header

### File List

- `packages/shared/src/types/order.types.ts` — Added `OrderDetail`, `OrderBag`, `OrderBagItem` interfaces with JSDoc
- `packages/shared/src/types/index.ts` — Exported new `OrderDetail`, `OrderBag`, `OrderBagItem` types
- `packages/shared/src/adapters/supplierAdapter.ts` — Updated `getOrder()` return type to `OrderDetail`, added import, JSDoc
- `packages/shared/src/adapters/violetAdapter.ts` — Implemented `getOrder()` with full Violet response parsing and JSDoc
- `apps/web/src/server/checkout.ts` — Added `getOrderDetailsFn` Server Function with JSDoc
- `apps/web/src/routes/order/$orderId/confirmation.tsx` — Rewrote stub → full confirmation page with SSR loader
- `apps/web/src/styles/pages/confirmation.css` — NEW: BEM styles for editorial warmth confirmation page
- `apps/web/src/styles/index.css` — Added `@import "./pages/confirmation.css"`
- `apps/web/src/routes/checkout/index.tsx` — Added `getStripeErrorMessage()`, CANCELED status handling, improved 3DS retry error messages
- `apps/mobile/src/app/checkout.tsx` — Hardened 3DS errors, added CANCELED handling, navigate to confirmation instead of home
- `apps/mobile/src/app/order/_layout.tsx` — NEW: Stack navigator layout for order routes
- `apps/mobile/src/app/order/[orderId]/confirmation.tsx` — NEW: Mobile confirmation screen with Edge Function fetch
- `supabase/functions/cart/index.ts` — Added `GET /orders/{orderId}` route and `transformOrder()` function
