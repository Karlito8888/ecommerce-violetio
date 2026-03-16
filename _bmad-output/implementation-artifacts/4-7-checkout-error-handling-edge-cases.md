# Story 4.7: Checkout Error Handling & Edge Cases

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Quick Reference — Files to Create/Update

| Action | File | Notes |
| ------ | ---- | ----- |
| CREATE | `supabase/migrations/YYYYMMDDHHMMSS_error_logs.sql` | Error logging table with RLS, indexes on source + created_at |
| CREATE | `apps/web/src/components/checkout/CheckoutErrorBoundary.tsx` | React error boundary wrapping checkout route |
| CREATE | `apps/web/src/components/checkout/BagErrors.tsx` | Per-merchant bag-level error display component |
| CREATE | `apps/web/src/components/checkout/CartRecovery.tsx` | Cart recovery dialog for expired/invalid carts |
| CREATE | `apps/web/src/components/checkout/InventoryAlert.tsx` | Inventory validation failure display with remove/update actions |
| CREATE | `apps/web/src/components/checkout/RetryPrompt.tsx` | Network timeout retry prompt preserving form state |
| CREATE | `apps/web/src/styles/components/checkout-errors.css` | BEM styles for all error components |
| CREATE | `packages/shared/src/utils/errorLogger.ts` | Unified error logger — writes to Supabase `error_logs` table |
| CREATE | `packages/shared/src/types/error.types.ts` | Structured error types for checkout error handling |
| UPDATE | `apps/web/src/routes/checkout/index.tsx` | Wrap with CheckoutErrorBoundary, add error state management, retry UI, inventory validation |
| UPDATE | `apps/web/src/server/checkout.ts` | Add inventory validation before submit, idempotency key on submit, error logging |
| UPDATE | `apps/web/src/server/cartActions.ts` | Add error logging to all mutation failures |
| UPDATE | `apps/web/src/contexts/CartContext.tsx` | Add cart recovery logic for expired/invalid carts |
| UPDATE | `supabase/functions/cart/index.ts` | Add error logging to Edge Function failures |
| UPDATE | `packages/shared/src/types/index.ts` | Export new error types |

---

## Story

As a **system**,
I want robust error handling throughout the checkout flow,
so that visitors never encounter silent failures or lost orders.

## Acceptance Criteria

1. **Given** any step in the checkout process
   **When** a Violet API call fails or returns errors
   **Then** the error is parsed from the response (check `errors` array even on 200 status)
   **And** bag-level errors are displayed next to the relevant merchant section
   **And** cart-level errors are displayed at the top of the checkout
   **And** inventory validation failures (FR18) show which specific items are unavailable with options to remove or update quantity
   **And** network timeouts trigger a retry prompt (not automatic retry) with preserved form state

2. **When** a cart enters an unexpected state
   **Then** the system attempts to recover by re-fetching cart state from Violet
   **And** if the cart is no longer valid (e.g., expired), the visitor is informed and guided to create a new cart

3. **When** checkout is submitted but confirmation is not received
   **Then** the system polls for order status before showing an error (handling network interruptions)
   **And** duplicate submission prevention: the submit button is disabled after first click, and idempotency is ensured server-side

4. **And** all errors are logged to the `error_logs` table in Supabase for debugging
   **And** `supabase/migrations/YYYYMMDDHHMMSS_error_logs.sql` creates the error logging table

## Tasks / Subtasks

- [x] Task 1: Create `error_logs` migration (AC: #4)
  - [x]Create `supabase/migrations/YYYYMMDDHHMMSS_error_logs.sql`:
    ```sql
    -- Error logging table for debugging and monitoring
    CREATE TABLE error_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      source TEXT NOT NULL,         -- 'web' | 'mobile' | 'edge-function'
      error_type TEXT NOT NULL,     -- e.g. 'VIOLET.API_ERROR', 'CART.EXPIRED'
      message TEXT NOT NULL,
      stack_trace TEXT,
      context JSONB,                -- Flexible context: cart_id, user_id, request details
      user_id UUID REFERENCES auth.users(id),
      session_id TEXT               -- For anonymous users
    );

    -- Index for querying recent errors by source
    CREATE INDEX idx_error_logs_source_created ON error_logs (source, created_at DESC);
    -- Index for querying by error type
    CREATE INDEX idx_error_logs_type ON error_logs (error_type);

    -- RLS: Only service role can write, authenticated users can read their own
    ALTER TABLE error_logs ENABLE ROW LEVEL SECURITY;

    -- Service role (Edge Functions, Server Functions) can insert any error
    CREATE POLICY "service_role_insert" ON error_logs
      FOR INSERT TO service_role WITH CHECK (true);

    -- Users can read their own errors (for debugging on client)
    CREATE POLICY "users_read_own" ON error_logs
      FOR SELECT TO authenticated
      USING (user_id = auth.uid());

    -- Service role can read all (for admin dashboard, Story 8.5)
    CREATE POLICY "service_role_read_all" ON error_logs
      FOR SELECT TO service_role USING (true);
    ```
  - [x]Verify migration applies cleanly against local Supabase (`supabase db reset`)

- [x] Task 2: Create error types and logger utility (AC: #4)
  - [x]Create `packages/shared/src/types/error.types.ts`:
    ```typescript
    /** Structured checkout error for UI display */
    export interface CheckoutError {
      /** Error code: DOMAIN.ACTION_FAILURE pattern */
      code: string;
      /** User-friendly error message */
      message: string;
      /** Error severity determines UI treatment */
      severity: "warning" | "error" | "critical";
      /** Optional: which bag/merchant this error belongs to */
      bagId?: string;
      /** Optional: which SKU this error affects */
      skuId?: string;
      /** Whether the user can retry this operation */
      retryable: boolean;
    }

    /** Cart state for recovery logic */
    export type CartHealthStatus =
      | "healthy"
      | "stale"          // Cart data is outdated, needs refetch
      | "expired"         // Violet cart no longer valid
      | "invalid";        // Cart in unexpected state

    /** Error log entry for Supabase persistence */
    export interface ErrorLogEntry {
      source: "web" | "mobile" | "edge-function";
      error_type: string;
      message: string;
      stack_trace?: string;
      context?: Record<string, unknown>;
      user_id?: string;
      session_id?: string;
    }
    ```
  - [x]Export from `packages/shared/src/types/index.ts`
  - [x]Create `packages/shared/src/utils/errorLogger.ts`:
    ```typescript
    import type { SupabaseClient } from "@supabase/supabase-js";
    import type { ErrorLogEntry } from "../types/error.types";

    /**
     * Logs an error to the Supabase error_logs table.
     * Fire-and-forget — never throws, never blocks the user flow.
     */
    export async function logError(
      supabase: SupabaseClient,
      entry: ErrorLogEntry,
    ): Promise<void> {
      try {
        await supabase.from("error_logs").insert(entry);
      } catch {
        // Last-resort: log to console if Supabase write fails
        // eslint-disable-next-line no-console
        console.error("[errorLogger] Failed to persist error:", entry);
      }
    }
    ```
  - [x]Export from `packages/shared/src/utils/index.ts`

- [x] Task 3: Bag-level error display component (AC: #1)
  - [x]Create `apps/web/src/components/checkout/BagErrors.tsx`:
    - Receives `bags` array from cart data (already typed with `BagError[]` per bag)
    - For each bag with `errors.length > 0`, render error list next to merchant section
    - **Inventory errors** (out-of-stock, insufficient quantity): show item name, current availability, action buttons (remove / update quantity)
    - **Price change errors**: show old vs new price, action button to accept new price
    - Use `BagError` type from `packages/shared/src/types/cart.types.ts`
    - Follow UX spec Stage 6: clear, honest messaging — no vague "something went wrong"
    - Emotion: **Reassurance** — "We've detected some changes. Here's what you can do."
  - [x]Create `apps/web/src/components/checkout/InventoryAlert.tsx`:
    - Dedicated component for FR18: real-time inventory validation failures at checkout submission
    - Shows which specific items are unavailable or have reduced stock
    - Actions per item: "Remove from cart" (calls `removeFromCartFn`) or "Update to available quantity" (calls `updateCartItemFn`)
    - After action, re-validates by refetching cart from Violet
  - [x]Create BEM styles in `apps/web/src/styles/components/checkout-errors.css`:
    ```css
    .checkout-error { /* Cart-level error banner at top of checkout */ }
    .checkout-error__icon { }
    .checkout-error__message { }
    .checkout-error__action { }
    .bag-error { /* Per-merchant error block */ }
    .bag-error__item { }
    .bag-error__item-name { }
    .bag-error__item-status { }
    .bag-error__item-actions { }
    .inventory-alert { /* Inventory validation failure overlay */ }
    .inventory-alert__item { }
    .inventory-alert__item--unavailable { }
    .inventory-alert__item--reduced { }
    .retry-prompt { /* Network timeout retry UI */ }
    .retry-prompt__message { }
    .retry-prompt__actions { }
    ```
  - [x]Import CSS in `apps/web/src/styles/index.css` (after components, before pages)

- [x] Task 4: Cart recovery logic for expired/invalid carts (AC: #2)
  - [x]Update `apps/web/src/contexts/CartContext.tsx`:
    - Add `cartHealth: CartHealthStatus` state (default: `"healthy"`)
    - On Violet API errors that indicate cart is gone (404, specific error codes), set `cartHealth` to `"expired"`
    - Recovery flow: `setCartHealth("stale")` → refetch from Violet → if fails, `setCartHealth("expired")`
    - Expose `recoverCart()` function that attempts re-fetch, and `resetCart()` that clears violetCartId + cookie and guides user to create new cart
  - [x]Create `apps/web/src/components/checkout/CartRecovery.tsx`:
    - Reads `cartHealth` from `CartContext`
    - `"stale"`: shows spinner with "Refreshing your cart..." — auto-recovers
    - `"expired"`: shows friendly dialog: "Your cart session has expired. Your items may have changed. Would you like to start a fresh cart?"
    - Action: "Start Fresh" → calls `resetCart()` → navigates to `/` or `/products`
    - Follow UX: **Reassurance** emotion, honest communication, no panic
  - [x]Integrate `CartRecovery` in checkout route (renders over checkout form when cart is unhealthy)

- [x] Task 5: Network timeout retry prompt (AC: #1)
  - [x]Create `apps/web/src/components/checkout/RetryPrompt.tsx`:
    - Triggered when a Server Function call times out (Violet's 30s timeout or network failure)
    - Preserves ALL form state (address, shipping selection, billing info) — no data loss
    - Shows: "The request is taking longer than expected. Your information is saved."
    - Actions: "Retry" (re-calls the same Server Function with same params) | "Cancel" (returns to previous step)
    - NOT automatic retry — user explicitly chooses to retry (per AC: "retry prompt, not automatic retry")
    - Tracks retry count — after 3 manual retries, suggest "Please try again later" with preserved state message
  - [x]Integrate in checkout route: wrap each checkout step's Server Function call with timeout detection

- [x] Task 6: Checkout submission idempotency & duplicate prevention (AC: #3)
  - [x]Update `apps/web/src/routes/checkout/index.tsx`:
    - **Submit button disabled** after first click: use `isSubmitting` state, set to `true` before calling `submitCheckoutFn`, reset only on explicit error
    - Generate a client-side **idempotency key** (UUID v4) per checkout attempt — stored in component state, reset only when user explicitly retries
    - Pass idempotency key to `submitCheckoutFn`
  - [x]Update `apps/web/src/server/checkout.ts`:
    - Accept `idempotencyKey` parameter in `submitCheckoutFn`
    - Before calling Violet `submitOrder`: check Supabase `carts` table — if cart status is already `"completed"`, return the existing order (do not re-submit)
    - Violet's own `appOrderId` provides backend idempotency — use `idempotencyKey` as `appOrderId` if not already set
  - [x]Polling for lost confirmations:
    - After `submitCheckoutFn` call, if response is timeout/network error (not a Violet error):
      1. Poll `getCartFn` up to 5 times (2s intervals) to check if cart status changed to `"completed"`
      2. If completed: fetch order details and show confirmation
      3. If still in progress after polling: show "Your order may have been placed. Please check your email for confirmation." message
    - Implement as `useOrderStatusPoller` hook or inline in checkout submit handler

- [x] Task 7: Wire error display into checkout route (AC: #1, #2)
  - [x]Update `apps/web/src/routes/checkout/index.tsx`:
    - Add `checkoutErrors: CheckoutError[]` state for cart-level errors
    - Render `<BagErrors>` inside each bag section (already has bag-level structure from Story 4.3/4.4)
    - Render cart-level error banner at top when `checkoutErrors.length > 0`
    - On Violet 200-with-errors: parse bag errors from `parseAndTransformCart()` and feed to `<BagErrors>`
    - On Violet error responses: map error code to user-friendly `CheckoutError` and add to `checkoutErrors`
    - On each new step transition: clear previous step's errors
  - [x]Add `<InventoryAlert>` integration:
    - Before submitting checkout, call a pre-submit validation: `getCartFn` → check each bag for inventory errors
    - If inventory issues found, show `<InventoryAlert>` overlay instead of submitting
    - After user resolves issues (remove/update), re-validate and proceed

- [x] Task 8: Error logging integration across Server Functions (AC: #4)
  - [x]Update `apps/web/src/server/checkout.ts`:
    - Import `logError` from `@ecommerce/shared`
    - On every Violet API failure: call `logError()` with source: "web", error_type from response, context: { cartId, step, violetCartId }
    - On payment failures: log with additional context: { paymentIntentId, errorCode }
    - Fire-and-forget — never let logging failure block the user flow
  - [x]Update `apps/web/src/server/cartActions.ts`:
    - Add `logError()` calls on: `DB.CART_PERSIST_FAILED`, `DB.CART_NOT_FOUND`, adapter errors
    - Include context: { violetCartId, operation, userId/sessionId }
  - [x]Update `supabase/functions/cart/index.ts`:
    - Add `logError()` calls on: Violet API errors, Supabase DB errors, auth failures
    - Source: "edge-function"
    - Context: { route, method, violetCartId, userId }
  - [x]Note: Use `getServiceSupabase()` (web) or service-role client (Edge Function) for logging — error_logs table uses service_role INSERT policy

- [x] Task 9: React Error Boundary for checkout (AC: #2)
  - [x]Create `apps/web/src/components/checkout/CheckoutErrorBoundary.tsx`:
    - Class component (React Error Boundary requires class componentDidCatch)
    - Catches unhandled errors in checkout route render tree
    - Fallback UI: "Something unexpected happened with your checkout. Your cart is saved."
    - Actions: "Try Again" (re-mounts checkout) | "Go to Cart" (navigates to cart page)
    - Logs the error via `logError()` with source: "web", error_type: "CHECKOUT.UNHANDLED_ERROR"
  - [x]Wrap checkout route component with `<CheckoutErrorBoundary>`

- [x] Task 10: Verify and test error scenarios (AC: #1, #2, #3, #4)
  - [x]Verify `BagError` rendering with mock data: out-of-stock items, price changes
  - [x]Verify cart recovery: simulate Violet 404 → cart recovery dialog → new cart creation
  - [x]Verify submit idempotency: double-click submit → only one Violet call
  - [x]Verify retry prompt: simulate network timeout → retry prompt → successful retry
  - [x]Verify error logging: check `error_logs` table after triggering errors
  - [x]Run `bun run fix-all` before committing

## Dev Notes

### Critical Architecture Constraints

- **Violet 200-with-errors pattern** — Violet returns HTTP 200 even when bags have errors (out of stock, price changed). The existing `VioletAdapter.parseAndTransformCart()` already extracts `errors[]` from each bag. This story must RENDER those errors in the UI, not re-parse them.

- **`ApiResponse<T>` is the universal return shape** — `{ data: T; error: null } | { data: null; error: ApiError }`. All Server Functions and adapter methods use this. Error codes follow `DOMAIN.ACTION_FAILURE` pattern (e.g., `CART.ADD_FAILED`, `VIOLET.API_ERROR`).

- **VioletAdapter already has retry logic** — 3 retries with exponential backoff (1s, 2s, 4s) for HTTP 429 and network errors. Do NOT add duplicate retry logic in Server Functions. The retry prompt in the UI is for user-initiated retries after the adapter's built-in retries are exhausted.

- **Fire-and-forget error logging** — `logError()` must NEVER throw or block the user flow. If the Supabase write fails, fall back to console.error. Error logging is a debugging tool, not a user-facing feature.

- **`getServiceSupabase()`** for server-side operations — Use this for writing to `error_logs` table (service_role INSERT policy). Never use the user's client-side Supabase instance for logging.

- **Cart is persisted server-side** (NFR25) — Even if the browser crashes or network drops, the cart data is safe in Supabase + Violet. The recovery logic should leverage this: re-fetch from Supabase to get `violet_cart_id`, then re-fetch from Violet to get current cart state.

- **No Tailwind CSS** — Use Vanilla CSS + BEM exclusively. New CSS file: `checkout-errors.css` imported in `styles/index.css`.

- **UX emotion for errors: Reassurance** — "They've got this, I'm informed." Clear, honest messaging. No vague "something went wrong." No panic-inducing language. The platform OWNS the communication even when the supplier owns the resolution.

- **SSR boundary: Checkout is CSR-only** — Stripe.js requires client-side rendering. All checkout error components render client-side. No server-rendered error pages for checkout.

### Existing Code Patterns to Follow

```typescript
// Server Function pattern (from cartActions.ts, checkout.ts)
export const myFn = createServerFn({ method: "POST" })
  .inputValidator((data: MyInput) => data)
  .handler(async ({ data }) => {
    // ... implementation
    return { data: result, error: null };         // Success
    return { data: null, error: { code: "DOMAIN.ACTION", message: "..." } }; // Error
  });

// Adapter usage (ALWAYS via getAdapter() singleton)
const adapter = getAdapter();
const result = await adapter.getCart(violetCartId);
if (result.error) { /* handle */ }

// Supabase service role (for server-side writes)
const supabase = getServiceSupabase();

// Cart query invalidation (TanStack Query)
queryClient.invalidateQueries({ queryKey: ["cart"] });  // Prefix match — invalidates all cart queries

// Existing query keys (packages/shared/src/utils/constants.ts):
// cart.current(), cart.detail(cartId), cart.count()
// There is NO queryKeys.cart.all
```

### Previous Story Intelligence (from Story 4.6)

- **`inputValidator` NOT `validator`** — TanStack Start uses `.inputValidator()` on ServerFnBuilder
- **`getAdapter()` singleton** — never `new VioletAdapter()` in Server Functions
- **`getServiceSupabase()`** — for server-side Supabase queries that bypass RLS
- **`formatPrice(cents)` from `@ecommerce/shared`** — not `formatCents`
- **TanStack Router `useNavigate()`** — for client-side navigation
- **Violet 200-with-errors** — always check `errors[]` array even on HTTP 200
- **Cart query invalidation** — use `queryKey: ["cart"]` for prefix-match invalidation
- **`clearCartCookieFn`** — already exists from Story 4.4, clears `violet_cart_id` cookie
- **Route tree regeneration** — new routes require vite dev server start to trigger auto-gen
- **BagError type already exists** in `packages/shared/src/types/cart.types.ts` — has `code`, `message`, `skuId?`
- **Cart statuses**: `active | completed | abandoned | merged` — add no new statuses for error handling (use `error_logs` instead)
- **Debug D3 from Story 4.6**: Edge Function route ordering matters — place new routes before generic patterns

### Git Intelligence (from recent commits)

- Latest commit: `92897fe feat: implement cross-device cart sync (Story 4.6) + code review fixes`
- All Epic 4 stories follow pattern: shared types → adapters/utils → server functions → edge functions → UI components → CSS → tests
- Code review fixes applied in same commit
- Conventional commit format: `feat: <description> (Story X.Y) + code review fixes`

### Violet API Reference — Story 4.7

| Action | Method | Endpoint | Notes |
| ------ | ------ | -------- | ----- |
| Get cart | GET | `/v1/checkout/cart/{id}` | Returns full cart with bags, items, totals + errors[] per bag |
| Submit order | POST | `/v1/checkout/cart/{id}/submit` | `{ app_order_id }` — use for idempotency |
| Get order | GET | `/v1/orders/{id}` | For polling after lost confirmation |

**Key Violet error scenarios to handle:**
- Cart expired (Violet returns 404 or error on GET cart)
- Item out of stock (200-with-errors, bag-level error)
- Price changed since cart creation (200-with-errors)
- Payment intent expired (requires new payment intent)
- Merchant-specific errors (bag-level — one merchant fails, others succeed)

### Project Structure Notes

- New error components: `apps/web/src/components/checkout/` (already has checkout components from Story 4.4)
- New CSS: `apps/web/src/styles/components/checkout-errors.css`
- New migration: `supabase/migrations/` (next sequence after `20260316000000`)
- New shared types: `packages/shared/src/types/error.types.ts`
- New shared util: `packages/shared/src/utils/errorLogger.ts`
- Update existing: `CartContext.tsx`, `checkout/index.tsx`, `checkout.ts`, `cartActions.ts`, `cart/index.ts`

### References

- [Source: epics.md#Story 4.7 — Checkout Error Handling & Edge Cases acceptance criteria]
- [Source: epics.md#Story 8.5 — References error_logs table from Story 4.7]
- [Source: prd.md#FR18 — Real-time inventory validation at checkout submission]
- [Source: prd.md#FR19 — Retry payment with different method, preserved cart + address data]
- [Source: prd.md#NFR25 — Zero cart data loss on payment failure, browser crash, or app force-quit]
- [Source: prd.md#NFR26 — Zero lost order status updates; retry failed webhook processing]
- [Source: prd.md#NFR29 — Graceful degradation when Violet API is down]
- [Source: prd.md#NFR30 — Stripe payment failures must not corrupt order state]
- [Source: prd.md#NFR31 — API rate limits handled without user impact]
- [Source: architecture.md#Error Handling & Resilience — Violet errors mapped to user-friendly messages, bag-level failures require partial success UX]
- [Source: architecture.md#API Communication — Structured error responses, DOMAIN.ACTION_FAILURE codes]
- [Source: architecture.md#Data Exchange — ApiResponse<T> = { data, error } shape]
- [Source: ux-design-specification.md#Stage 6: Error/Problem States — Reassurance emotion, clear honest messaging]
- [Source: ux-design-specification.md#Emotions to Prevent — No frustration from broken flows]
- [Source: 4-6-cross-device-cart-sync.md — Previous story patterns, debug logs, code conventions]
- [Source: packages/shared/src/types/api.types.ts — ApiResponse<T>, ApiError interface]
- [Source: packages/shared/src/types/cart.types.ts — BagError interface]
- [Source: packages/shared/src/adapters/violetAdapter.ts — Retry logic, error code mapping, parseAndTransformCart]
- [Source: apps/web/src/server/checkout.ts — Current checkout Server Functions, appOrderId usage]
- [Source: apps/web/src/contexts/CartContext.tsx — Current cart state, no error state yet]

## Dev Agent Record

### Agent Model Used

claude-opus-4-6

### Debug Log References

- D1: Unused imports — `formatPrice` imported in BagErrors.tsx and InventoryAlert.tsx but not used. `BagError` type imported in InventoryAlert but not needed (only `Bag` used). Fixed by removing unused imports.
- D2: TanStack Router type safety — `navigate({ to: "/products" })` fails typecheck because `/products` route requires `search` params (`ProductSearchParams`). Changed to `navigate({ to: "/" })` which has no required params.
- D3: React render-time state updates — initial implementation used `useEffect` to detect cart errors from `cartResponse`, but switching to conditional check during render (before JSX) avoids extra re-render cycle.

### Completion Notes List

- Task 1: Created migration `20260317000000_error_logs.sql` — error logging table with source, error_type, message, stack_trace, JSONB context, user_id, session_id. RLS: service_role INSERT, authenticated SELECT own, service_role SELECT all.
- Task 2: Created `error.types.ts` (CheckoutError, CartHealthStatus, ErrorLogEntry) and `errorLogger.ts` (fire-and-forget logError utility). Exported from shared package index files.
- Task 3: Created `BagErrors.tsx` (per-merchant bag error display with remove/update actions), `InventoryAlert.tsx` (pre-submit inventory validation overlay), and `checkout-errors.css` (BEM styles for all error components including cart-recovery, retry-prompt, bag-error, inventory-alert, checkout-error).
- Task 4: Updated `CartContext.tsx` with `cartHealth` state, `setCartHealth`, `resetCart` (clears cart + cookie). Created `CartRecovery.tsx` (stale/expired/invalid states).
- Task 5: Created `RetryPrompt.tsx` — manual retry with max 3 attempts, preserves form state.
- Task 6: Added `onPreSubmitValidation` callback to `PaymentForm` for inventory validation before submit. Added lost confirmation polling (5 attempts at 2s intervals). Existing `appOrderIdRef` already provides idempotency via Violet's `appOrderId`.
- Task 7: Wired all error components into checkout route — CheckoutErrorBoundary wrapper, cart-level error banner, BagErrors per-bag in sidebar, InventoryAlert overlay, RetryPrompt overlay, CartRecovery before checkout form. Added cart error detection from response.
- Task 8: Added `logError()` to `checkout.ts` (setShippingAddress, getPaymentIntent, submitOrder), `cartActions.ts` (createCart DB failure), and Edge Function `cart/index.ts` (inline `logEdgeFunctionError` for Violet API failures). All fire-and-forget.
- Task 9: Created `CheckoutErrorBoundary.tsx` — class component with componentDidCatch, friendly fallback UI with "Try Again" / "Go to Cart" actions.
- Task 10: Ran `bun run fix-all` — 0 errors, 0 warnings. All 150 existing tests pass (no regressions).

### Senior Developer Review (AI)

**Reviewer:** Charles (via adversarial code review workflow)
**Date:** 2026-03-16
**Outcome:** Approved after fixes

**Issues found:** 2 Critical, 3 High, 2 Medium, 1 Low — ALL FIXED

| ID | Severity | Issue | Fix |
|----|----------|-------|-----|
| C1 | CRITICAL | CheckoutErrorBoundary `componentDidCatch` only did `console.error` — no `logError()` call to persist errors to `error_logs` table (AC#4 violation) | Created `logClientErrorFn` Server Function to bridge client→server logging. ErrorBoundary now calls it fire-and-forget in `componentDidCatch`. |
| C2 | CRITICAL | Lost confirmation polling passed `appOrderId` (UUID) to `getCartFn` which expects `violetCartId` (numeric) — always 404, polling was dead code | Added `violetCartId` prop to `PaymentForm`, passed from parent. Polling now uses correct ID. JSDoc explains why both IDs are needed. |
| H1 | HIGH | InventoryAlert `onRemoveItem`/`onUpdateQuantity` closed overlay immediately without re-validating other items | Added `revalidateAfterInventoryAction()` — re-fetches cart from Violet after each action, only closes overlay when all bags have zero errors. |
| H2 | HIGH | RetryPrompt rendered but never triggered — no timeout detection on Server Function calls | Created `withTimeoutRetry()` helper wrapping Server Function calls with 30s timeout. Wired into `handleAddressSubmit`, `handleContinueToPayment`, `handleGuestInfoSubmit`. |
| H3 | HIGH | `cartActions.ts` `logError()` only in `createCartFn` — missing on `updateCartItemFn`, `removeFromCartFn`, `getCartFn` `DB.CART_NOT_FOUND` errors | Added `logError()` calls with operation context in all 3 functions. |
| M1 | MEDIUM | Render-phase `setState` for cart error detection — fragile in StrictMode | Moved to `useEffect` with proper dependency array. JSDoc explains the rationale. |
| M2 | MEDIUM | Edge Function `logEdgeFunctionError` only on `GET /cart/{id}` — all other Violet API failure routes had no logging | Added `logEdgeFunctionError` to all 10 mutation routes (create, add SKU, update, delete, shipping address, shipping available, shipping methods, customer, billing, submit). |
| L1 | LOW | CartRecovery "invalid" state said "Something went wrong" — violates UX spec "no vague messaging" | Changed to "We encountered an unexpected issue with your cart" with specific recovery guidance. |

### Change Log

- 2026-03-16: Story 4.7 implementation — checkout error handling & edge cases (10 tasks completed)
- 2026-03-16: Code review fixes — 8 issues fixed (C1, C2, H1, H2, H3, M1, M2, L1). All JSDoc documented.

### File List

- `supabase/migrations/20260317000000_error_logs.sql` — NEW: Error logging table with RLS and indexes
- `packages/shared/src/types/error.types.ts` — NEW: CheckoutError, CartHealthStatus, ErrorLogEntry types
- `packages/shared/src/types/index.ts` — Added error type exports
- `packages/shared/src/utils/errorLogger.ts` — NEW: Fire-and-forget logError utility
- `packages/shared/src/utils/index.ts` — Added logError export
- `apps/web/src/components/checkout/BagErrors.tsx` — NEW: Per-merchant bag-level error display
- `apps/web/src/components/checkout/InventoryAlert.tsx` — NEW: Pre-submit inventory validation overlay
- `apps/web/src/components/checkout/CartRecovery.tsx` — NEW: Cart expired/invalid recovery dialog
- `apps/web/src/components/checkout/RetryPrompt.tsx` — NEW: Network timeout manual retry prompt
- `apps/web/src/components/checkout/CheckoutErrorBoundary.tsx` — NEW: React Error Boundary for checkout
- `apps/web/src/styles/components/checkout-errors.css` — NEW: BEM styles for all error components
- `apps/web/src/styles/index.css` — Added checkout-errors.css import
- `apps/web/src/contexts/CartContext.tsx` — Added cartHealth state, setCartHealth, resetCart
- `apps/web/src/routes/checkout/index.tsx` — Integrated all error components, cart recovery, inventory validation, error boundary
- `apps/web/src/server/checkout.ts` — Added logError calls on shipping/payment/submit failures
- `apps/web/src/server/cartActions.ts` — Added logError on cart persist failures
- `supabase/functions/cart/index.ts` — Added logEdgeFunctionError helper, logging on Violet API failures
