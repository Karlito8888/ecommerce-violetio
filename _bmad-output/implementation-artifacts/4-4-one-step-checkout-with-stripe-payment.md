# Story 4.4: One-Step Checkout with Stripe Payment (Web + Mobile)

Status: done

## Quick Reference — Files to Create/Update

| Action  | File                                              | Notes                                                                                                                                                                                |
| ------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| UPDATE  | `packages/shared/src/types/cart.types.ts`         | Add `CustomerInput`; add `paymentIntentClientSecret?: string` to `Cart`                                                                                                              |
| UPDATE  | `packages/shared/src/types/order.types.ts`        | Expand `Order` with Violet submit response fields; add `OrderStatus`, `OrderSubmitInput`                                                                                             |
| UPDATE  | `packages/shared/src/schemas/cart.schema.ts`      | Add `payment_intent_client_secret` (optional) to `violetCartResponseSchema`                                                                                                          |
| UPDATE  | `packages/shared/src/adapters/supplierAdapter.ts` | Replace `getPaymentIntent`/`submitOrder` stubs with corrected signatures                                                                                                             |
| UPDATE  | `packages/shared/src/adapters/violetAdapter.ts`   | **Add `wallet_based_checkout: true` to createCart body**; parse `payment_intent_client_secret` in `parseAndTransformCart`; implement `getPaymentIntent` (GET cart) and `submitOrder` |
| UPDATE  | `apps/web/src/server/checkout.ts`                 | Add `setCustomerFn`, `getPaymentIntentFn`, `submitOrderFn`                                                                                                                           |
| UPDATE  | `apps/web/src/routes/checkout/index.tsx`          | Add guest info section (before address), billing address option, Stripe PaymentElement, submit flow + 3DS                                                                            |
| UPDATE  | `apps/web/src/styles/pages/checkout.css`          | Add `.checkout__payment`, `.checkout__customer`, `.checkout__billing` BEM blocks                                                                                                     |
| UPDATE  | `supabase/functions/cart/index.ts`                | Add `POST /{id}/customer` and `POST /{id}/submit` routes for mobile                                                                                                                  |
| UPDATE  | `apps/mobile/src/app/checkout.tsx`                | Add guest info form + Stripe PaymentSheet step                                                                                                                                       |
| INSTALL | `apps/web`                                        | `@stripe/stripe-js @stripe/react-stripe-js`                                                                                                                                          |
| INSTALL | `apps/mobile`                                     | `@stripe/stripe-react-native`                                                                                                                                                        |
| CHECK   | `.env` / `apps/web/.env.local`                    | `VITE_STRIPE_PUBLISHABLE_KEY` must be set                                                                                                                                            |

---

## Story

As a **visitor**,
I want to complete checkout in a single page/screen with my payment details,
so that the purchase process is fast and frictionless.

## Acceptance Criteria

1. **Given** a visitor has items in cart and has selected shipping methods (Story 4.3 complete)
   **When** they click "Continue to Payment"
   **Then** a guest info section is displayed collecting: email, first name, last name
   **And** an optional unchecked marketing consent checkbox is present per AC from FR20

2. **When** the visitor submits guest info
   **Then** it is sent via `POST /checkout/cart/{id}/customer` with `{ email, first_name, last_name }`
   **And** the billing address section becomes visible (defaults to same as shipping, toggle to enter different)

3. **When** the billing address is confirmed (same as shipping = default, or different address filled)
   **Then** if different: `POST /checkout/cart/{id}/billing_address` is called
   **And** the Stripe PaymentElement is initialized with `payment_intent_client_secret` from the cart

4. **And** the Stripe PaymentElement supports card, Apple Pay, and Google Pay (`wallet_based_checkout: true`)

5. **And** the `payment_intent_client_secret` is obtained from the Violet cart object (returned in every cart GET response when cart was created with `wallet_based_checkout: true`)

6. **When** the visitor clicks "Place Order"
   **Then** `stripe.confirmPayment()` is called client-side (authorizes but does NOT charge)
   **And** if Stripe returns `REQUIRES_ACTION` (3D Secure): `stripe.handleNextAction()` is called, then `/submit` is re-called
   **And** `POST /checkout/cart/{id}/submit` is called server-side with `{ app_order_id }`
   **And** on success the visitor is redirected to `/order/{orderId}/confirmation` (Story 4.5 stub: show "Order placed!")

7. **And** the submit button shows a loading state and is disabled during processing

8. **And** if submission fails, the visitor stays on the checkout page with a clear inline error message
   **And** form data is preserved (no data loss on error)

9. **And** all Violet API calls go through Server Functions (web) / Edge Functions (mobile) — Violet token never on client

10. **And** web: checkout page remains CSR (no `loader`) — Stripe.js requires client-side rendering

11. **And** mobile: payment uses `@stripe/stripe-react-native` PaymentSheet

12. **And** web: `wallet_based_checkout: true` must be in the cart creation body (fix in `createCart`) — without this, `payment_intent_client_secret` is not returned by Violet

13. **And** duplicate submission prevention: submit button disabled after first click; idempotency via `app_order_id`

## Tasks / Subtasks

- [x] Task 1: Add `wallet_based_checkout: true` to `createCart` in `violetAdapter.ts` (AC: #5, #12)
  - [x] Update the POST body in `createCart`: `{ channel_id: Number(appId), currency: "USD", wallet_based_checkout: true }`
  - [x] Add `payment_intent_client_secret: z.string().optional()` and `stripe_key: z.string().optional()` to `violetCartResponseSchema` in `cart.schema.ts`
  - [x] Add `paymentIntentClientSecret?: string` to the `Cart` interface in `cart.types.ts`
  - [x] Update `parseAndTransformCart()` in `violetAdapter.ts` to map `payment_intent_client_secret` → `paymentIntentClientSecret`
  - [x] **⚠️ Sandbox note**: Existing test carts created without `wallet_based_checkout: true` will NOT have `payment_intent_client_secret`. Start a fresh cart for testing Story 4.4.

- [x] Task 2: Add `CustomerInput` type and update `Order` type (AC: #1, #2)
  - [x] Add to `cart.types.ts`:
    ```typescript
    export interface CustomerInput {
      email: string;
      firstName: string;
      lastName: string;
      /** Per-merchant marketing opt-in (FR20). false by default. */
      marketingConsent?: boolean;
    }
    ```
  - [x] Add to `order.types.ts`:
    ```typescript
    export type OrderStatus =
      | "IN_PROGRESS"
      | "PROCESSING"
      | "COMPLETED"
      | "REQUIRES_ACTION"
      | "REJECTED"
      | "CANCELED";
    export interface OrderSubmitInput {
      appOrderId: string;
    }
    export interface OrderSubmitResult {
      id: string;
      status: OrderStatus;
      paymentIntentClientSecret?: string; // present only when status === "REQUIRES_ACTION"
      bags: Array<{ id: string; status: string; financialStatus: string; total: number }>;
    }
    ```
  - [x] Export new types from `packages/shared/src/types/index.ts`

- [x] Task 3: Update `supplierAdapter.ts` interface and implement in `violetAdapter.ts` (AC: #2, #6)
  - [x] Update supplierAdapter.ts signatures:
    ```typescript
    setCustomer(violetCartId: string, customer: CustomerInput): Promise<ApiResponse<void>>;
    getPaymentIntent(violetCartId: string): Promise<ApiResponse<PaymentIntent>>;
    submitOrder(violetCartId: string, appOrderId: string): Promise<ApiResponse<OrderSubmitResult>>;
    ```
  - [x] Implement `setCustomer` in `violetAdapter.ts`:
    ```
    POST /checkout/cart/{violetCartId}/customer
    Body: { email, first_name: firstName, last_name: lastName }
    Returns { data: null, error: null } on success
    ```
  - [x] Implement `getPaymentIntent` in `violetAdapter.ts`:
    ```
    GET /checkout/cart/{violetCartId}
    Parse response with violetCartResponseSchema
    Return PaymentIntent { id: "pi_...", clientSecret: payment_intent_client_secret, amount: total, currency }
    ```
  - [x] Implement `submitOrder` in `violetAdapter.ts`:
    ```
    POST /checkout/cart/{violetCartId}/submit
    Body: { app_order_id: appOrderId }
    Parse response: check status field ("COMPLETED" vs "REQUIRES_ACTION" vs "REJECTED")
    If REQUIRES_ACTION: return { data: { status: "REQUIRES_ACTION", paymentIntentClientSecret: ... }, error: null }
    If COMPLETED: return { data: { status: "COMPLETED", id: cart.id, bags: [...] }, error: null }
    Always check errors[] array (200-with-errors pattern)
    ```
  - [x] Add `setBillingAddress` to supplierAdapter.ts + violetAdapter.ts:
    ```
    POST /checkout/cart/{violetCartId}/billing_address
    Body: same shape as shipping_address (ShippingAddressInput minus phone — see Violet docs)
    ```

- [x] Task 4: Add Server Functions to `apps/web/src/server/checkout.ts` (AC: #2, #6, #9)
  - [x] `setCustomerFn` (POST):
    ```typescript
    export const setCustomerFn = createServerFn({ method: "POST" })
      .inputValidator((data: CustomerInput) => data)
      .handler(async ({ data }) => {
        const violetCartId = getCookie("violet_cart_id");
        if (!violetCartId)
          return { data: null, error: { code: "NO_CART", message: "No active cart" } };
        return getAdapter().setCustomer(violetCartId, data);
      });
    ```
  - [x] `getPaymentIntentFn` (GET):
    ```typescript
    export const getPaymentIntentFn = createServerFn({ method: "GET" }).handler(
      async (): Promise<ApiResponse<PaymentIntent>> => {
        const violetCartId = getCookie("violet_cart_id");
        if (!violetCartId)
          return { data: null, error: { code: "NO_CART", message: "No active cart" } };
        return getAdapter().getPaymentIntent(violetCartId);
      },
    );
    ```
  - [x] `setBillingAddressFn` (POST, optional — only called if billing ≠ shipping):
    ```typescript
    export const setBillingAddressFn = createServerFn({ method: "POST" })
      .inputValidator((data: ShippingAddressInput) => data)
      .handler(async ({ data }) => {
        const violetCartId = getCookie("violet_cart_id");
        if (!violetCartId)
          return { data: null, error: { code: "NO_CART", message: "No active cart" } };
        return getAdapter().setBillingAddress(violetCartId, data);
      });
    ```
  - [x] `submitOrderFn` (POST):
    ```typescript
    export const submitOrderFn = createServerFn({ method: "POST" })
      .inputValidator((data: { appOrderId: string }) => data)
      .handler(async ({ data }): Promise<ApiResponse<OrderSubmitResult>> => {
        const violetCartId = getCookie("violet_cart_id");
        if (!violetCartId)
          return { data: null, error: { code: "NO_CART", message: "No active cart" } };
        return getAdapter().submitOrder(violetCartId, data.appOrderId);
      });
    ```
  - [x] Use `inputValidator` (NOT `validator`) — confirmed from Story 4.3 D1 debug note

- [x] Task 5: Install Stripe packages (AC: #3, #4, #10, #11)
  - [x] Web: `bun add @stripe/stripe-js @stripe/react-stripe-js` in `apps/web`
  - [x] Mobile: `bun add @stripe/stripe-react-native` in `apps/mobile`
  - [x] Verify `VITE_STRIPE_PUBLISHABLE_KEY` is set in `apps/web/.env.local` (Stripe publishable key, safe for client)
  - [x] Mobile: `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` in `apps/mobile/.env`

- [x] Task 6: Update checkout page `apps/web/src/routes/checkout/index.tsx` — add guest info + payment steps (AC: #1–#8, #10, #13)
  - [x] Extend step state machine: `"address" | "methods" | "guestInfo" | "billing" | "payment" | "complete"`
  - [x] Flow is: address → methods → guestInfo → billing → payment → complete
  - [x] The existing "Continue to Payment" button (in `confirmed` step) transitions to `guestInfo` step
  - [x] **Guest Info section** (`.checkout__section.checkout__customer`):
    - Fields: email (required), firstName (required), lastName (required)
    - Marketing consent: `<label><input type="checkbox" unchecked by default> Receive updates from merchants</label>`
    - On submit: call `setCustomerFn` → on success → transition to `billing` step
  - [x] **Billing Address section** (`.checkout__billing`):
    - Default: "Same as shipping address" checkbox (checked)
    - If unchecked: show full address form (same fields as shipping, reuse `ShippingAddressInput`)
    - On confirm: if different billing, call `setBillingAddressFn` → then call `getPaymentIntentFn` → transition to `payment` step
    - If same billing: skip `setBillingAddressFn`, call `getPaymentIntentFn` directly → transition to `payment`
  - [x] **Payment section** (`.checkout__payment`):
    - Load Stripe: `loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY)`
    - Wrap with `<Elements stripe={stripePromise} options={{ clientSecret }}>` from `@stripe/react-stripe-js`
    - Embed `<PaymentElement />` inside the Elements wrapper
    - "Place Order" button: calls submit handler (see C3 below)
    - Show inline error message on payment/submit failure
  - [x] **Submit handler** (see C3 — complete flow):
    - Generate `appOrderId` = `crypto.randomUUID()` (stable per session via `useRef`)
    - Disable submit button immediately on click
    - Call `stripe.confirmPayment({ elements, redirect: "if_required" })` first
    - On Stripe error: show error, re-enable button
    - On Stripe success: call `submitOrderFn({ appOrderId })`
    - On `REQUIRES_ACTION`: call `stripe.handleNextAction({ clientSecret })` → re-call `submitOrderFn`
    - On `COMPLETED`: clear violet_cart_id cookie state + navigate to `/order/{orderId}/confirmation` (stub OK for now)
    - On `REJECTED`: show "Order was rejected" error
  - [x] Keep CSR: no `loader` in `createFileRoute('/checkout/')` (Stripe.js is client-side only)

- [x] Task 7: Update `apps/web/src/styles/pages/checkout.css` (AC: #10)
  - [x] Add `.checkout__customer` block with form field styling
  - [x] Add `.checkout__billing` block with same-as-shipping toggle
  - [x] Add `.checkout__payment` block for Stripe PaymentElement container
  - [x] Add `.checkout__consent` for the marketing consent checkbox
  - [x] Style the "Place Order" button with loading spinner state (`.checkout__submit--loading`)

- [x] Task 8: Update Supabase Edge Function for mobile — `supabase/functions/cart/index.ts` (AC: #9, #11)
  - [x] Add `POST /{cartId}/customer` route:
    ```
    Forward body to Violet POST /checkout/cart/{cartId}/customer
    Body: { email, first_name, last_name } (mobile sends these directly in snake_case)
    Return Violet response as-is
    ```
  - [x] Add `POST /{cartId}/billing_address` route:
    ```
    Forward body to Violet POST /checkout/cart/{cartId}/billing_address
    Same body shape as shipping_address
    ```
  - [x] Add `POST /{cartId}/submit` route:
    ```
    Forward body to Violet POST /checkout/cart/{cartId}/submit
    Body: { app_order_id }
    Return Violet response (includes status, bags, payment_intent_client_secret if REQUIRES_ACTION)
    ```
  - [x] Path matching order: `/billing_address` BEFORE `/submit`, same approach as shipping_address pattern

- [x] Task 9: Update mobile checkout screen `apps/mobile/src/app/checkout.tsx` (AC: #11)
  - [x] Install `@stripe/stripe-react-native` and wrap app with `<StripeProvider publishableKey={...}>` (check if already in `_layout.tsx`)
  - [x] Add guest info form step after shipping confirmation (email, first name, last name, marketing consent toggle)
  - [x] On guest info submit: call Edge Function `POST /{cartId}/customer`
  - [x] On success: call Edge Function `GET /{cartId}` to get `payment_intent_client_secret` OR parse it from GET cart response
  - [x] Use Stripe `useStripe()` hook + `initPaymentSheet()` + `presentPaymentSheet()`:
    ```typescript
    const { initPaymentSheet, presentPaymentSheet } = useStripe();
    await initPaymentSheet({
      merchantDisplayName: "E-commerce",
      paymentIntentClientSecret: paymentIntentClientSecret,
      allowsDelayedPaymentMethods: false,
    });
    const { error } = await presentPaymentSheet();
    ```
  - [x] On PaymentSheet success: call Edge Function `POST /{cartId}/submit` with `{ app_order_id: uuid }`
  - [x] On success: navigate to order confirmation (Story 4.5 stub)
  - [x] On REQUIRES_ACTION from submit response: `handleNextAction` not available in PaymentSheet — show error asking user to retry

## Dev Notes

### Critical Architecture Constraints

- **`wallet_based_checkout: true` MUST be in cart creation** — Without this flag in `POST /checkout/cart`, Violet does NOT include `payment_intent_client_secret` in cart responses. Task 1 must be done FIRST. All new carts will have this; old sandbox carts won't — start a fresh cart for testing.

- **NEVER call `POST /checkout/cart/{id}/payment`** — This endpoint is for non-wallet checkout (standard card token flow). With `wallet_based_checkout: true`, the payment intent is already created at cart creation time. Calling `/payment` is unnecessary and may cause errors.

- **Violet checkout order of operations (from official docs)**:
  1. ✅ Set shipping address (Story 4.3)
  2. ✅ Get available shipping methods (Story 4.3)
  3. ✅ Set shipping methods (Story 4.3)
  4. 🆕 Set customer: `POST /checkout/cart/{id}/customer`
  5. 🆕 (Optional) Set billing address: `POST /checkout/cart/{id}/billing_address`
  6. 🆕 Client-side: `stripe.confirmPayment()` (authorizes, does NOT charge)
  7. 🆕 `POST /checkout/cart/{id}/submit`
     Note: customer can be set BEFORE shipping in the UI — but Violet requires shipping to be set before submit.

- **`stripe.confirmPayment()` does NOT charge the card** — It authorizes and checks funds. The card is charged only after a successful `/submit`. If submit fails, the authorization falls off within a few business days. This is critical for the error UX: a payment failure at submit does not mean the user was charged.

- **3DS flow** — Submit returns `{ status: "REQUIRES_ACTION", payment_intent_client_secret: "..." }`. Call `stripe.handleNextAction({ clientSecret })` to open the 3DS challenge. After challenge resolves, re-call `/submit`. The Stripe `PaymentElement` handles 3DS natively when `redirect: "if_required"` is passed to `confirmPayment`.

- **`paymentIntentClientSecret` on the client** — This field must come from a Server Function (never stored in a cookie or localStorage). It's fetched via `getPaymentIntentFn` which calls GET /checkout/cart/{id} server-side. The secret is only passed to Stripe SDK client-side; it is NOT stored in any React state that would be serialized.

- **Stripe publishable key** — Use `VITE_STRIPE_PUBLISHABLE_KEY` env var on web. This is the Stripe-format `pk_test_...` or `pk_live_...` key. Safe for the client. Do NOT use the Violet `stripe_key` from the cart response (it's the same key but no reason to expose it via API when we can use the env var directly).

- **CSR boundary** — `loadStripe()` and `<Elements>` MUST be client-side. The checkout page already has no `loader`. Ensure `loadStripe()` is called outside the component (module level) to avoid recreating the Stripe instance on each render.

- **Idempotency for submit** — Generate `appOrderId = crypto.randomUUID()` once per checkout session (use `useRef` to persist across re-renders). Reuse the same `appOrderId` for re-submissions after REQUIRES_ACTION. This prevents duplicate orders.

- **`inputValidator` not `validator`** — TanStack Start's ServerFnBuilder API uses `.inputValidator()`. Using `.validator()` causes a TypeScript error. Confirmed from Story 4.3 D1.

- **`getAdapter()` singleton** — Never `new VioletAdapter()` in Server Functions. Always `getAdapter()` from `./violetAdapter`.

### C1 — Violet customer endpoint field mapping

```
Our CustomerInput (camelCase)    ↔  Violet POST /customer body (snake_case)
────────────────────────────────────────────────────────────────────────────
email                            ↔  email
firstName                        ↔  first_name
lastName                         ↔  last_name
marketingConsent (optional)      ↔  communication_preferences: [{ enabled: true/false }]
                                    (per-merchant, sent only if user opted in)
```

Note: `communication_preferences` is per-bag (per-merchant). If marketingConsent is true, include it for all bags. The Violet docs show this as an array on the customer object.

### C2 — `getPaymentIntent` implementation (GET cart → extract secret)

```typescript
async getPaymentIntent(violetCartId: string): Promise<ApiResponse<PaymentIntent>> {
  const result = await this.fetchWithRetry(
    `${this.apiBase}/checkout/cart/${violetCartId}`,
    { method: "GET" }
  );
  if (result.error) return { data: null, error: result.error };

  const parsed = violetCartResponseSchema.safeParse(result.data);
  if (!parsed.success) {
    return { data: null, error: { code: "PARSE_ERROR", message: "Invalid cart response" } };
  }

  const secret = parsed.data.payment_intent_client_secret;
  if (!secret) {
    return {
      data: null,
      error: {
        code: "VIOLET.NO_PAYMENT_INTENT",
        message: "Cart was not created with wallet_based_checkout: true. Recreate the cart.",
      },
    };
  }

  return {
    data: {
      id: `pi_from_cart_${violetCartId}`,
      clientSecret: secret,
      amount: parsed.data.total ?? 0,
      currency: parsed.data.currency ?? "USD",
    },
    error: null,
  };
}
```

### C3 — Submit flow (web, complete with 3DS)

```typescript
async function handlePlaceOrder() {
  if (!stripe || !elements) return;
  setIsSubmitting(true);
  setSubmitError(null);

  // Step 1: Confirm payment client-side (authorize, do NOT charge yet)
  const { error: stripeError } = await stripe.confirmPayment({
    elements,
    redirect: "if_required",
  });

  if (stripeError) {
    setSubmitError(stripeError.message ?? "Payment authorization failed");
    setIsSubmitting(false);
    return;
  }

  // Step 2: Submit to Violet (charges the card)
  const result = await submitOrderFn({ data: { appOrderId } });

  if (result.error) {
    setSubmitError(result.error.message);
    setIsSubmitting(false);
    return;
  }

  if (result.data.status === "REQUIRES_ACTION") {
    // Step 3: Handle 3DS challenge
    const { error: actionError } = await stripe.handleNextAction({
      clientSecret: result.data.paymentIntentClientSecret!,
    });

    if (actionError) {
      setSubmitError(actionError.message ?? "3D Secure authentication failed");
      setIsSubmitting(false);
      return;
    }

    // Step 4: Re-submit after 3DS (reuse same appOrderId for idempotency)
    const retryResult = await submitOrderFn({ data: { appOrderId } });
    if (retryResult.error || retryResult.data.status === "REJECTED") {
      setSubmitError(retryResult.error?.message ?? "Order was rejected after 3D Secure");
      setIsSubmitting(false);
      return;
    }

    navigate({ to: `/order/${retryResult.data.id}/confirmation` });
    return;
  }

  if (result.data.status === "REJECTED") {
    setSubmitError("Your order was rejected. Please try a different payment method.");
    setIsSubmitting(false);
    return;
  }

  // Success
  navigate({ to: `/order/${result.data.id}/confirmation` });
}
```

### C4 — Stripe Elements initialization (web)

```typescript
// Module-level (outside component) — prevents Stripe re-instantiation
const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);

// Inside component, after getPaymentIntentFn returns:
const [clientSecret, setClientSecret] = useState<string | null>(null);

// When transitioning to payment step:
const pi = await getPaymentIntentFn();
if (pi.error) { setError(pi.error.message); return; }
setClientSecret(pi.data.clientSecret);

// JSX:
{clientSecret && (
  <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: "flat" } }}>
    <PaymentForm onSubmit={handlePlaceOrder} isLoading={isSubmitting} error={submitError} />
  </Elements>
)}
```

**Separate `PaymentForm` component is needed** because `useStripe()` and `useElements()` hooks only work inside an `<Elements>` provider. Extract the payment section into a `PaymentForm` child component.

### C5 — `submitOrder` implementation in violetAdapter.ts

```typescript
async submitOrder(violetCartId: string, appOrderId: string): Promise<ApiResponse<OrderSubmitResult>> {
  const result = await this.fetchWithRetry(
    `${this.apiBase}/checkout/cart/${violetCartId}/submit`,
    {
      method: "POST",
      body: JSON.stringify({ app_order_id: appOrderId }),
    }
  );

  if (result.error) return { data: null, error: result.error };

  const data = result.data as {
    id?: number;
    status?: string;
    payment_status?: string;
    payment_intent_client_secret?: string;
    bags?: Array<{ id?: number; status?: string; financial_status?: string; total?: number }>;
    errors?: unknown[];
  };

  // Check 200-with-errors pattern
  if (Array.isArray(data.errors) && data.errors.length > 0) {
    return { data: null, error: { code: "VIOLET.ORDER_ERROR", message: "Order submission failed with errors", details: data.errors } };
  }

  return {
    data: {
      id: String(data.id ?? ""),
      status: (data.status ?? "COMPLETED") as OrderStatus,
      paymentIntentClientSecret: data.payment_intent_client_secret,
      bags: (data.bags ?? []).map(b => ({
        id: String(b.id ?? ""),
        status: b.status ?? "",
        financialStatus: b.financial_status ?? "",
        total: b.total ?? 0,
      })),
    },
    error: null,
  };
}
```

### C6 — violetCartResponseSchema additions

```typescript
export const violetCartResponseSchema = z.object({
  id: z.number(),
  channel_id: z.number().optional(),
  currency: z.string().optional().default("USD"),
  total: z.number().optional(), // 🆕 for PaymentIntent amount
  payment_intent_client_secret: z.string().optional(), // 🆕 Story 4.4
  stripe_key: z.string().optional(), // 🆕 (informational, use env var instead)
  bags: z.array(violetBagSchema).optional().default([]),
  errors: z.array(violetBagErrorSchema).optional().default([]),
});
```

### C7 — parseAndTransformCart update

```typescript
// In parseAndTransformCart(), add after the existing cart fields:
paymentIntentClientSecret: parsed.data.payment_intent_client_secret,
```

And in the Cart interface (`cart.types.ts`):

```typescript
export interface Cart {
  // ... existing fields ...
  /** Stripe payment intent client secret — only present when cart was created with wallet_based_checkout: true. */
  paymentIntentClientSecret?: string;
}
```

### C8 — Order confirmation stub (Story 4.5 dependency)

Story 4.5 will implement full order confirmation. For Story 4.4, a minimal stub is acceptable:

- Web: if `/order/${orderId}/confirmation` route doesn't exist, navigate to `/` with a toast "Order placed!" for now
- OR create a minimal `apps/web/src/routes/order/$orderId/confirmation.tsx` stub that shows "Order placed! ID: {orderId}"
- Do NOT implement full confirmation UI — that's Story 4.5

### C9 — Marketing consent field mapping

Per UX Design Spec: "optional, unchecked-by-default checkbox for marketing consent per merchant"
Per Violet API: `communication_preferences` is a per-merchant (per-bag) field.

Implementation approach:

```typescript
// In setCustomer adapter method body:
const body: Record<string, unknown> = {
  email: customer.email,
  first_name: customer.firstName,
  last_name: customer.lastName,
};

// Only include communication_preferences if user opted in
if (customer.marketingConsent) {
  body.communication_preferences = [{ enabled: true }];
}
```

**Note**: Violet's exact `communication_preferences` schema is not fully documented. If the API rejects this field, remove it from the POST body — marketing consent tracking can be done in our own Supabase table as a fallback.

### Previous Story Intelligence (from 4.3 + 4.2 + 4.1)

- **`inputValidator` NOT `validator`** — Story 4.3 D1: TanStack Start uses `.inputValidator()` on ServerFnBuilder
- **`vinxi/http` NOT available** — use `@tanstack/react-start/server` for `getCookie`
- **`getAdapter()` singleton** — never `new VioletAdapter()` in Server Functions
- **Checkout page is CSR** — `createFileRoute('/checkout/')` with NO loader
- **`formatPrice(cents)` from `@ecommerce/shared`** — not `formatCents`
- **TanStack Router `useNavigate()`** — for client-side navigation after order submit
- **Violet 200-with-errors** — always check `errors[]` array even on HTTP 200
- **`@tanstack/react-router` for `<Link>`** — never `<a href>` for internal navigation
- **Cart query invalidation** — after submit, invalidate `['cart', 'detail', violetCartId]`
- **Mobile: `router.push()` from `expo-router`** for navigation
- **Mobile: spacing scale** — only `half` → `six` + `eight` are valid `Spacing` constants
- **Story 4.3 D3 critical fix**: `shipping_method_id` is the correct field (not `id`) in GET /shipping/available
- **Story 4.3 D3**: `name`/`email` removed from ShippingAddressInput (they belong to Customer — Story 4.4)
- **Story 4.3 D3**: `min_days`/`max_days` do NOT exist in Violet shipping API in practice
- **Edge Function path matching** — check more specific paths first (e.g., `/billing_address` before `/submit`)

### Violet API Reference — Story 4.4 (Official Docs Confirmed)

| Action              | Method | Endpoint                                 | Notes                                                                   |
| ------------------- | ------ | ---------------------------------------- | ----------------------------------------------------------------------- |
| Set customer info   | POST   | `/v1/checkout/cart/{id}/customer`        | `{ email, first_name, last_name }` — Story 4.4                          |
| Set billing address | POST   | `/v1/checkout/cart/{id}/billing_address` | Same body shape as shipping_address. Optional if same as shipping.      |
| Get cart (+ secret) | GET    | `/v1/checkout/cart/{id}`                 | Returns `payment_intent_client_secret` if `wallet_based_checkout: true` |
| Stripe confirm      | —      | Client-side `stripe.confirmPayment()`    | Authorizes only; no Violet API call                                     |
| Submit order        | POST   | `/v1/checkout/cart/{id}/submit`          | `{ app_order_id }` — charges card after Stripe auth                     |
| 3DS recovery        | —      | Client-side `stripe.handleNextAction()`  | Then re-call `/submit`                                                  |

**Violet billing_address body confirmed from docs:**

```json
{
  "address_1": "string",
  "address_2": "string",
  "city": "string",
  "state": "string",
  "country": "string",
  "postal_code": "string"
}
```

Note: `phone` is NOT listed in billing_address docs (only in shipping_address). Do not include phone in billing address body.

**Submit response — COMPLETED:**

```json
{
  "id": 12345,
  "status": "COMPLETED",
  "payment_status": "CAPTURED",
  "bags": [{ "id": 999, "status": "ACCEPTED", "financial_status": "PAID", "total": 5898 }],
  "payment_transactions": [{ "status": "CAPTURED", "amount": 5898 }],
  "errors": []
}
```

**Submit response — REQUIRES_ACTION (3DS):**

```json
{
  "status": "REQUIRES_ACTION",
  "payment_status": "REQUIRES_ACTION",
  "payment_intent_client_secret": "pi_..._secret_..."
}
```

**Key Violet behavior (official docs):**

- `stripe.confirmPayment()` does NOT charge — only authorizes
- Card is charged only after successful `/submit`
- If submit fails, auth falls off within days (no charge to user)
- `wallet_based_checkout: true` MUST be in cart creation body for PaymentElement to work
- Apple Pay: `redirect: "if_required"` in `confirmPayment` prevents redirect-based flow

### Web Research Notes — Violet.io Official Documentation

Source: `https://docs.violet.io` (fetched 2026-03-14)

**Key findings from official docs:**

1. `phone` is listed as **required** in shipping_address (Story 4.3 already included it via `ShippingAddressInput.phone`)
2. `wallet_based_checkout: true` — confirmed correct field name in cart creation body
3. `payment_intent_client_secret` — confirmed present in every GET cart response after wallet-based creation
4. `stripe_key` is returned in cart response but equals Stripe publishable key — safe to use env var instead
5. Quick Checkout optimization available (4 API calls) but not applicable here since cart was created separately
6. `communication_preferences` for marketing consent — not fully documented; treat as optional
7. Submit body: `{ app_order_id: "your-unique-order-id" }` — confirmed field name
8. Billing address phone: NOT required (unlike shipping address) — do not include phone in billing_address body

### Project Structure Notes

- `PaymentForm` component: extract as a separate component in `apps/web/src/routes/checkout/` (or inline if simple enough) — required because `useStripe()`/`useElements()` hooks need to be inside `<Elements>`
- `loadStripe()` call: at module level in the checkout route file (outside component, prevents Stripe re-init)
- Stripe env var: `VITE_STRIPE_PUBLISHABLE_KEY` in `apps/web/.env.local` (Vite exposes `VITE_` prefix client-side)
- Mobile Stripe env: `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` in `apps/mobile/.env` (Expo exposes `EXPO_PUBLIC_` prefix)
- New Edge Function routes in `supabase/functions/cart/index.ts`: `/customer`, `/billing_address`, `/submit`
- Order confirmation stub: `apps/web/src/routes/order/$orderId/confirmation.tsx` (create minimal placeholder)

### References

- [Source: epics.md#Story 4.4 — complete acceptance criteria and FR references]
- [Source: epics.md#Epic 4 — wallet_based_checkout: true dependency note]
- [Source: architecture.md#Data Flow — Checkout sequence: POST /payment → payment_intent_client_secret → confirmPayment → submit]
- [Source: architecture.md#SSR strategy — Checkout: CSR (Stripe Elements requires client-side)]
- [Source: architecture.md#Integration Points — Stripe: client-side Stripe.js, publishable key]
- [Source: ux-design-specification.md#Checkout — single page flow, Apple Pay/Google Pay primary, unchecked consent]
- [Source: ux-design-specification.md#Payment error recovery — connection interrupted messaging, form data preservation]
- [Source: 4-3-shipping-method-selection.md — D1: inputValidator not validator; D3: field name corrections from Violet]
- [Source: packages/shared/src/types/order.types.ts — PaymentIntent, Order placeholder types]
- [Source: packages/shared/src/adapters/violetAdapter.ts:1026 — getPaymentIntent stub (throws "Not implemented")]
- [Source: packages/shared/src/adapters/violetAdapter.ts:838 — createCart (missing wallet_based_checkout: true)]
- [Source: packages/shared/src/schemas/cart.schema.ts:40 — violetCartResponseSchema (missing payment_intent_client_secret)]
- [Source: apps/web/src/routes/checkout/index.tsx — 705 lines, step machine: address → methods → confirmed]
- [Source: apps/web/src/server/checkout.ts — Server Function pattern to extend]
- [Source: supabase/functions/cart/index.ts — Edge Function routing pattern for mobile]
- [Violet.io Official Docs: POST /v1/checkout/cart/{id}/customer — { email, first_name, last_name }]
- [Violet.io Official Docs: POST /v1/checkout/cart/{id}/billing_address — same shape as shipping, no phone]
- [Violet.io Official Docs: POST /v1/checkout/cart/{id}/submit — { app_order_id }, returns COMPLETED or REQUIRES_ACTION]
- [Violet.io Official Docs: wallet_based_checkout: true — payment_intent_client_secret in cart creation response + GET]
- [Violet.io Official Docs: stripe.confirmPayment() — authorizes only; card charged only on successful /submit]
- [Violet.io Official Docs: REQUIRES_ACTION — stripe.handleNextAction() then re-submit with same app_order_id]
- [Stripe Docs: @stripe/react-stripe-js Elements + PaymentElement — CSR only, useStripe() inside Elements provider]
- [Stripe Docs: @stripe/stripe-react-native PaymentSheet — initPaymentSheet + presentPaymentSheet]

## Dev Agent Record

### Agent Model Used

claude-opus-4-6

### Debug Log References

- D1: TS2367 narrowing error — `step !== "address"` inside `{step !== "address" && ...}` block. TypeScript correctly narrows the type, making the inner comparison always-true. Fixed by removing redundant check.
- D2: Route tree regeneration — order confirmation route requires vite dev server start to trigger TanStack Router plugin auto-generation of `routeTree.gen.ts`.

### Completion Notes List

- Task 1: Added `wallet_based_checkout: true` to both web (VioletAdapter.createCart) and mobile (Edge Function cart creation). Updated Zod schema with `payment_intent_client_secret`, `total`, and `stripe_key` fields. Mapped to Cart interface's new `paymentIntentClientSecret` field.
- Task 2: Created `CustomerInput` type in cart.types.ts, `OrderStatus`/`OrderSubmitInput`/`OrderSubmitResult` types in order.types.ts. Exported all from types/index.ts.
- Task 3: Updated SupplierAdapter interface with `setCustomer`, `setBillingAddress`, `getPaymentIntent` (corrected signature), `submitOrder` (corrected signature). Implemented all 4 methods in VioletAdapter with full JSDoc.
- Task 4: Added 4 Server Functions: `setCustomerFn`, `setBillingAddressFn`, `getPaymentIntentFn`, `submitOrderFn` — all using `inputValidator` (not `validator`), `getCookie("violet_cart_id")`, and `getAdapter()` singleton.
- Task 5: Installed `@stripe/stripe-js` + `@stripe/react-stripe-js` in web, `@stripe/stripe-react-native` in mobile. Added `VITE_STRIPE_PUBLISHABLE_KEY` to web .env.example.
- Task 6: Rewrote checkout page with full step machine (address → methods → confirmed → guestInfo → billing → payment). Created PaymentForm child component (Stripe hooks require Elements provider). Module-level `loadStripe()` singleton. `useRef` for appOrderId idempotency. Created order confirmation stub route.
- Task 7: Added CSS for `.checkout__consent`, `.checkout__payment`, `.checkout__submit--place-order`, `.checkout__submit--loading`, `.checkout__submit-spinner` BEM classes.
- Task 8: Added 3 Edge Function routes: POST /{id}/customer, POST /{id}/billing_address, POST /{id}/submit. Path matching order preserved (billing_address before submit).
- Task 9: Rewrote mobile checkout with guest info form, marketing consent toggle, Stripe PaymentSheet integration (`initPaymentSheet` + `presentPaymentSheet`). Added `StripeProvider` to root `_layout.tsx`. All JSDoc documented per user request.

### Change Log

- 2026-03-15: Story 4.4 implementation — one-step checkout with Stripe payment (9 tasks completed)
- 2026-03-15: Code review fixes — H1: checked all subtasks; H2: added billing address step to mobile checkout; M1: clarified phone stripping in setBillingAddressFn docstring; M2: added clearCartCookieFn to clear violet_cart_id after successful order; M3: removed dead `confirmed` step from mobile CheckoutStep type; M4: included Violet error details in submitOrder error message

### File List

- `packages/shared/src/types/cart.types.ts` — Added `CustomerInput` interface, `paymentIntentClientSecret` to `Cart`
- `packages/shared/src/types/order.types.ts` — Added `OrderStatus`, `OrderSubmitInput`, `OrderSubmitResult` types
- `packages/shared/src/types/index.ts` — Exported new types
- `packages/shared/src/schemas/cart.schema.ts` — Added `total`, `payment_intent_client_secret`, `stripe_key` to schema
- `packages/shared/src/adapters/supplierAdapter.ts` — Added `setCustomer`, `setBillingAddress`, updated `getPaymentIntent`/`submitOrder` signatures
- `packages/shared/src/adapters/violetAdapter.ts` — Added `wallet_based_checkout: true`, implemented `setCustomer`, `setBillingAddress`, `getPaymentIntent`, `submitOrder`
- `apps/web/src/server/checkout.ts` — Added `setCustomerFn`, `setBillingAddressFn`, `getPaymentIntentFn`, `submitOrderFn`
- `apps/web/src/routes/checkout/index.tsx` — Full rewrite: guest info + billing + Stripe PaymentElement + submit flow
- `apps/web/src/routes/order/$orderId/confirmation.tsx` — NEW: order confirmation stub (Story 4.5)
- `apps/web/src/styles/pages/checkout.css` — Added customer, billing, payment BEM blocks
- `apps/web/.env.example` — Added `VITE_STRIPE_PUBLISHABLE_KEY`
- `apps/web/src/routeTree.gen.ts` — Auto-regenerated (new order confirmation route)
- `supabase/functions/cart/index.ts` — Added `wallet_based_checkout: true`, customer/billing_address/submit routes, paymentIntentClientSecret in transformCart
- `apps/mobile/src/app/checkout.tsx` — Full rewrite: guest info + Stripe PaymentSheet flow
- `apps/mobile/src/app/_layout.tsx` — Added StripeProvider wrapper
- `apps/web/package.json` — Added @stripe/stripe-js, @stripe/react-stripe-js
- `apps/mobile/package.json` — Added @stripe/stripe-react-native
