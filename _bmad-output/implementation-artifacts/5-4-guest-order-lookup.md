# Story 5.4: Guest Order Lookup (Web + Mobile)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Quick Reference — Files to Create/Update

| Action | File | Notes |
| ------ | ---- | ----- |
| CREATE | `apps/web/src/server/guestOrders.ts` | Server Functions: `lookupOrderByTokenFn`, `lookupOrdersByEmailFn` + pure handlers |
| CREATE | `apps/web/src/routes/order/lookup.tsx` | Multi-step lookup form: email → OTP → results + token direct-link path |
| CREATE | `apps/web/src/styles/pages/lookup.css` | BEM CSS for lookup page |
| UPDATE | `apps/web/src/styles/index.css` | Add `@import "pages/lookup.css"` in pages section |
| CREATE | `apps/web/src/server/__tests__/guestOrders.test.ts` | Unit tests for server function handlers |
| UPDATE | `apps/mobile/src/app/profile.tsx` | Add "Track an Order" link visible to ALL users (anonymous + authenticated) |
| CREATE | `apps/mobile/src/app/order/lookup.tsx` | React Native guest lookup screen (email + OTP + results) |

---

## Story

As a **guest buyer**,
I want to look up my order status using my email address or my order token,
so that I can track my purchase without creating an account.

## Acceptance Criteria

1. **Given** a guest buyer who has the order lookup token from their confirmation page
   **When** they visit `/order/lookup?token=<token>` (web) or use the direct-link on mobile
   **Then** the token is hashed server-side (SHA-256) and matched against `orders.order_lookup_token_hash`
   **And** the matching order is displayed with full detail (bags + items) — same visual layout as authenticated `/account/orders/:orderId`
   **And** invalid or expired tokens return a "not found" message (no information leakage)

2. **Given** a guest buyer who does not have their token
   **When** they visit `/order/lookup` and enter their email address
   **Then** a 6-digit verification code is sent to that email via Supabase Auth OTP (`signInWithOtp`)
   **And** after entering the code correctly, all orders associated with that email are listed
   **And** the order list shows: order date, total, overall status, merchant count (FR27)

3. **Given** a guest buyer viewing their orders after email verification
   **When** they click an order
   **Then** the order detail is shown inline (same `.order-detail` BEM layout as Story 5.3)
   **And** the lookup session (temporary OTP auth session) is signed out after display

4. **Given** email-based lookup
   **When** Supabase's built-in OTP rate limiting is triggered (3 OTP requests per hour per email)
   **Then** a user-friendly error is shown: "Too many requests. Please wait before trying again." (NFR security)
   **And** the form does not allow re-submission while rate-limited

5. **Given** the web route `/order/lookup`
   **When** rendered
   **Then** the page is `noindex` (meta robots) — guest lookup pages should not be indexed by search engines
   **And** the page title is "Track Your Order | Maison Émile"

6. **Given** the mobile profile screen
   **When** viewed by ANY user (anonymous or authenticated)
   **Then** a "Track an Order" navigation item is visible in the profile/settings screen
   **And** tapping it navigates to the mobile lookup screen

7. **Given** a guest email with NO orders in Supabase
   **When** OTP verification succeeds
   **Then** an empty state is shown: "No orders found for this email. Check the address or contact support."

## Tasks / Subtasks

- [x] Task 1: Server Functions — `apps/web/src/server/guestOrders.ts` (AC: #1, #2, #7)
  - [x] 1.1: Import `hashOrderLookupToken` from `@ecommerce/shared/src/utils/server` (server-only barrel — contains node:crypto-based exports)
  - [x] 1.2: Create `lookupOrderByTokenHandler(token: string): Promise<OrderWithBagsAndItems | null>`:
    - Hash token: `const tokenHash = hashOrderLookupToken(token)`
    - Use `getSupabaseServer()` (service role — bypasses RLS because guests have no `user_id`)
    - Query: `.from("orders").select("*, order_bags(*, order_items(*))").eq("order_lookup_token_hash", tokenHash).single()`
    - Return null on PGRST116 (not found), throw on other errors
  - [x] 1.3: Create `lookupOrdersByEmailHandler(): Promise<OrderWithBagsAndItems[]>`:
    - Confirm session exists: use `getSupabaseSessionClient().auth.getUser()` — throws "Not authenticated" if no session
    - Extract `user.email` from the verified Supabase session (OTP verification has already confirmed email ownership)
    - Fetch orders using `getSupabaseServer()` (service_role): `.from("orders").select("*, order_bags(*, order_items(*))").eq("email", user.email).order("created_at", { ascending: false })`
    - Return empty array if no rows found
  - [x] 1.4: Export as TanStack Start Server Functions:
    ```typescript
    export const lookupOrderByTokenFn = createServerFn({ method: "GET" })
      .inputValidator((data: { token: string }) => data)
      .handler(async ({ data }) => lookupOrderByTokenHandler(data.token));

    export const lookupOrdersByEmailFn = createServerFn({ method: "GET" })
      .handler(() => lookupOrdersByEmailHandler());
    ```

- [x] Task 2: Web route — `apps/web/src/routes/order/lookup.tsx` (AC: #1, #2, #3, #4, #5, #7)
  - [x] 2.1: `createFileRoute("/order/lookup")` with `validateSearch` accepting optional `token?: string`:
    ```typescript
    validateSearch: (search: Record<string, unknown>) => ({
      token: (search.token as string) || "",
    })
    ```
  - [x] 2.2: `head()` returning `buildPageMeta({ title: "Track Your Order | Maison Émile", noindex: true, ... })`
  - [x] 2.3: State machine type:
    ```typescript
    type LookupStep =
      | { step: "email" }
      | { step: "verify"; email: string }
      | { step: "results"; orders: OrderWithBagsAndItems[] }
      | { step: "token-result"; order: OrderWithBagsAndItems };
    ```
  - [x] 2.4: **Token auto-lookup**: in component, `useEffect` on mount — if `token` search param present, call `lookupOrderByTokenFn({ data: { token } })`, set state to `{ step: "token-result", order }` or show error
  - [x] 2.5: **Step "email"** — Email input form:
    - Submit calls `supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } })`
    - On success: set state to `{ step: "verify", email }`
    - On error code 429 / "rate limit": show rate limit message (AC #4)
    - Use `getSupabaseBrowserClient()` (from `../../utils/supabase`)
  - [x] 2.6: **Step "verify"** — OTP input form (reuse pattern from `auth/verify.tsx`):
    - 6-digit numeric input, `autoComplete="one-time-code"`, `inputMode="numeric"`
    - Submit calls `supabase.auth.verifyOtp({ email, token: otp, type: "email" })`
    - On success: call `await lookupOrdersByEmailFn()`, set state to `{ step: "results", orders }`
    - Then immediately sign out: `await supabase.auth.signOut()` (clean up temporary OTP session)
    - On error: "Invalid or expired code. Please try again."
  - [x] 2.7: **Step "results"** — Order list (same visual as `account/orders/index.tsx`):
    - If `orders.length === 0`: empty state message (AC #7)
    - Each order card: date, total, status badge (use `ORDER_STATUS_LABELS`), merchant count
    - Clicking an order card expands inline detail (use same markup as `account/orders/$orderId.tsx` — `.order-detail` block)
    - Use `formatPrice()` and `formatDate()` from `@ecommerce/shared`
  - [x] 2.8: **Step "token-result"** — Single order detail (same `.order-detail` markup as `$orderId.tsx`)
  - [x] 2.9: **Token-not-found** error state: "Order not found. Your token may have expired or been mistyped."
  - [x] 2.10: Loading skeleton state during token auto-lookup (same pattern as account/orders — skeleton, not spinner)

- [x] Task 3: CSS — `apps/web/src/styles/pages/lookup.css` (AC: #5)
  - [x] 3.1: `.order-lookup` — page container (max-width: 640px, margin: auto, same as `.orders` block)
  - [x] 3.2: `.order-lookup__title` — page heading with Cormorant Garamond font
  - [x] 3.3: `.order-lookup__subtitle` — descriptive subtitle text
  - [x] 3.4: `.order-lookup__form` — form wrapper (same spacing as `.auth-form`)
  - [x] 3.5: `.order-lookup__step-indicator` — optional "Step 1 of 2" breadcrumb
  - [x] 3.6: `.order-lookup__email-note` — "We'll send a 6-digit code to…" label
  - [x] 3.7: `.order-lookup__results-header` — "Your Orders" heading above results list
  - [x] 3.8: `.order-lookup__empty` — empty state (no orders found)
  - [x] 3.9: `.order-lookup__error` — error message block (rate limit, not found, etc.)
  - [x] 3.10: `.order-lookup__skeleton` — skeleton loading placeholder
  - [x] 3.11: Note: The `.order-detail` and `.orders__card` BEM classes from `orders.css` are REUSED as-is for the result display — do NOT duplicate them in lookup.css

- [x] Task 4: Update CSS index — `apps/web/src/styles/index.css` (AC: #5)
  - [x] 4.1: Add `@import "pages/lookup.css";` after `@import "pages/orders.css";`

- [x] Task 5: Mobile profile update — `apps/mobile/src/app/profile.tsx` (AC: #6)
  - [x] 5.1: Import `Link` (or navigation) from expo-router
  - [x] 5.2: Add "Order Tracking" section OUTSIDE the `{isAnonymous ? ... : ...}` block — visible to ALL users:
    ```tsx
    <ThemedText type="default" style={styles.sectionHeader}>Order Tracking</ThemedText>
    <Pressable onPress={() => router.push("/order/lookup")} style={styles.trackingLink}>
      <ThemedText type="default">Track an Order</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">Look up guest orders by email or token</ThemedText>
    </Pressable>
    ```
  - [x] 5.3: Add `trackingLink` style: `{ padding: Spacing.three, borderRadius: 8, backgroundColor: colors.linen }`

- [x] Task 6: Mobile lookup screen — `apps/mobile/src/app/order/lookup.tsx` (AC: #1, #2, #3, #6, #7)
  - [x] 6.1: Check for `token` URL param via `useLocalSearchParams()` — if present, auto-lookup
  - [x] 6.2: For token lookup: call Supabase Edge Function `guest-order-lookup` via fetch (mobile cannot call TanStack Start Server Functions)
  - [x] 6.3: Email OTP flow (same as web but React Native):
    - Use `supabase.auth.signInWithOtp({ email })` (Supabase JS client — works on mobile)
    - Use `supabase.auth.verifyOtp({ email, token: code, type: "email" })`
    - After verification: fetch orders from Edge Function with session JWT
    - After displaying results: `supabase.auth.signOut()`
  - [x] 6.4: Results display: use `FlatList` with order cards + expandable detail
  - [x] 6.5: **New Edge Function** `supabase/functions/guest-order-lookup/index.ts`:
    - Handles BOTH platforms (mobile + future web migration)
    - Endpoint: `POST /guest-order-lookup { type: "token" | "email", token?: string }`
    - For "token": hash via Web Crypto API (SHA-256), query orders by hash using service_role
    - For "email": verify JWT from Authorization header, extract email, query orders by email using service_role
    - Returns: `{ data: OrderWithBagsAndItems[] | null }` or `{ error: { code, message } }`

- [x] Task 7: Unit Tests — `apps/web/src/server/__tests__/guestOrders.test.ts` (AC: #1, #2, #7)
  - [x] 7.1: Mock `getSupabaseServer()` and `getSupabaseSessionClient()`
  - [x] 7.2: Test `lookupOrderByTokenHandler` with valid token → returns order (query called with correct hash)
  - [x] 7.3: Test `lookupOrderByTokenHandler` with invalid token → returns null (PGRST116 error)
  - [x] 7.4: Test `lookupOrdersByEmailHandler` with authenticated session → queries by email, returns orders
  - [x] 7.5: Test `lookupOrdersByEmailHandler` with no session → throws "Not authenticated"
  - [x] 7.6: Test `lookupOrdersByEmailHandler` with session but no orders → returns empty array
  - [x] 7.7: Run `bun run fix-all` — 0 errors, 0 warnings ✅
  - [x] 7.8: Run `bun --cwd=apps/web run test` — all tests pass (175/175) ✅
  - [x] 7.9: Run `bun run typecheck` — no type errors ✅

## Dev Notes

### Critical Architecture Constraints

- **`getSupabaseServer()` IS REQUIRED for guest lookups** — The `orders` table has no RLS policy for anonymous users (by design, from Story 5.1): `-- No anon/public SELECT policy needed — guest lookup goes through service_role`. Using `getSupabaseSessionClient()` would fail for token-based lookups. Use `getSupabaseServer()` for the actual DB query.

- **`getSupabaseSessionClient()` for email identity verification** — After Supabase OTP verification, the user has a temporary session. Use `getSupabaseSessionClient()` ONLY to confirm the user's email (via `supabase.auth.getUser()`), then switch to `getSupabaseServer()` for the orders query. Do NOT use the session client for the orders query (it would fail due to missing RLS policy for email-based access).

- **`hashOrderLookupToken` is server-only** — Located in `packages/shared/src/utils/guestToken.ts`. Import from the server-only barrel: `import { hashOrderLookupToken } from "@ecommerce/shared/src/utils/server"`. Do NOT import from `@ecommerce/shared` (the main barrel) as that would fail in client bundles (uses `node:crypto`).

- **Mobile cannot call TanStack Start Server Functions** — Server Functions are HTTP endpoints served by the TanStack Start server (Cloudflare Worker). Mobile app calls Supabase directly (Supabase JS client) or Supabase Edge Functions. The new `guest-order-lookup` Edge Function (Task 6.5) solves this.

- **Token is NOT stored — only its hash** — The `orders.order_lookup_token_hash` column contains a SHA-256 hex digest. The plaintext token is only shown once on the confirmation page (Story 5.1). The server must hash the incoming token before querying. Never compare plaintexts.

- **Supabase OTP rate limiting is sufficient for email path** — Supabase Auth enforces 3 OTP requests per hour per email address by default. No additional custom rate limiting is needed for the email verification step. For the token lookup step, the 256-bit token entropy makes brute force impractical.

- **Sign out after lookup (temporary OTP session)** — When a guest uses email OTP to verify, Supabase creates a temporary auth session for them. After displaying results, call `supabase.auth.signOut()` to clean up. This prevents the guest from inadvertently having an active session they don't know about.

- **shouldCreateUser: true for signInWithOtp** — Using `shouldCreateUser: false` would fail for guests who don't have an auth.users account (which is the common case). Use `shouldCreateUser: true`. This creates a "passwordless" auth.users entry linked to their email. The guest doesn't get a "real" account — they'd need to go through signup to set a password. This is acceptable and consistent with Supabase's magic link pattern.

- **Route conflict prevention** — TanStack Router prioritizes literal path segments over dynamic ones. `/order/lookup` (literal "lookup") will correctly NOT match the `$orderId` param route (which would be a UUID). No special config needed.

- **Reuse `.order-detail` BEM classes** — The guest lookup results should look identical to the authenticated order detail. Reuse the BEM classes from `orders.css` (`.order-detail`, `.order-detail__bag`, `.order-detail__item`, `.order-detail__tracking`, `.order-detail__pricing`). Do NOT duplicate these in `lookup.css`.

### Existing Utilities to Reuse (DO NOT REBUILD)

| Utility | Location | What it provides |
| ------- | -------- | ---------------- |
| `hashOrderLookupToken(token)` | `@ecommerce/shared/src/utils/server` (server-only) | SHA-256 hash of lookup token |
| `getSupabaseServer()` | `apps/web/src/server/supabaseServer.ts` | Service role Supabase client (bypasses RLS) |
| `getSupabaseSessionClient()` | `apps/web/src/server/supabaseServer.ts` | Session-aware client (respects RLS) |
| `getSupabaseBrowserClient()` | `apps/web/src/utils/supabase.ts` | Browser Supabase client (for auth OTP calls) |
| `ORDER_STATUS_LABELS` | `packages/shared/src/utils/orderStatusDerivation.ts` | Order status → user-friendly label |
| `BAG_STATUS_LABELS` | `packages/shared/src/utils/orderStatusDerivation.ts` | Bag status → user-friendly label |
| `getBagStatusSummary()` | `packages/shared/src/utils/orderStatusDerivation.ts` | "X of Y items shipped" summary |
| `formatPrice()` | `packages/shared/src/utils/formatPrice.ts` | Integer cents → formatted string |
| `formatDate()` | `packages/shared/src/utils/formatPrice.ts` | Date → formatted string (added in Story 5.3) |
| `buildPageMeta()` | `@ecommerce/shared` | SEO meta tag builder |
| `OrderWithBagsAndItems` | `packages/shared/src/hooks/useOrders.ts` | Type: OrderRow + order_bags (with items) |
| `OrderWithBagCount` | `packages/shared/src/hooks/useOrders.ts` | Type: OrderRow + bag_count (for list view) |

### Existing Code Patterns to Follow

```typescript
// Server Function pattern (from orders.ts — handler + wrapper separation for testability):
export async function lookupOrderByTokenHandler(
  token: string
): Promise<OrderWithBagsAndItems | null> {
  const tokenHash = hashOrderLookupToken(token);
  const supabase = getSupabaseServer(); // service role — no RLS

  const { data, error } = await supabase
    .from("orders")
    .select("*, order_bags(*, order_items(*))")
    .eq("order_lookup_token_hash", tokenHash)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null; // not found
    throw new Error(error.message);
  }
  return data as unknown as OrderWithBagsAndItems;
}

export const lookupOrderByTokenFn = createServerFn({ method: "GET" })
  .inputValidator((data: { token: string }) => data)
  .handler(async ({ data }) => lookupOrderByTokenHandler(data.token));
```

```typescript
// Route with optional search params (from auth/verify.tsx):
export const Route = createFileRoute("/order/lookup")({
  head: () => ({
    meta: buildPageMeta({ title: "Track Your Order | Maison Émile", noindex: true, url: "/order/lookup", siteUrl: SITE_URL }),
  }),
  validateSearch: (search: Record<string, unknown>) => ({
    token: (search.token as string) || "",
  }),
  component: LookupPage,
});

function LookupPage() {
  const { token } = Route.useSearch();
  // if token is non-empty: auto-lookup on mount
  // else: show email form
}
```

```typescript
// Supabase OTP email verification (client-side, following auth/login + auth/verify pattern):
const supabase = getSupabaseBrowserClient();

// Step 1: Send OTP
const { error } = await supabase.auth.signInWithOtp({
  email,
  options: { shouldCreateUser: true },
});

// Step 2: Verify OTP
const { error } = await supabase.auth.verifyOtp({
  email,
  token: otp, // the 6-digit code
  type: "email",
});

// Step 3: Fetch orders (Server Function — runs server-side)
const orders = await lookupOrdersByEmailFn();

// Step 4: Sign out (cleanup)
await supabase.auth.signOut();
```

```typescript
// Email-based server function (using session to verify, service_role to fetch):
export async function lookupOrdersByEmailHandler(): Promise<OrderWithBagsAndItems[]> {
  // Verify the OTP session exists (Supabase confirmed email ownership via OTP)
  const sessionSupabase = getSupabaseSessionClient();
  const { data: { user } } = await sessionSupabase.auth.getUser();
  if (!user?.email) throw new Error("Not authenticated");

  // Use service_role to query by email (no user_id-based RLS for guest orders)
  const supabase = getSupabaseServer();
  const { data, error } = await supabase
    .from("orders")
    .select("*, order_bags(*, order_items(*))")
    .eq("email", user.email)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as OrderWithBagsAndItems[];
}
```

```css
/* lookup.css — use .order-detail BEM from orders.css for results, not duplicate */
.order-lookup {
  max-width: 640px;
  margin: 0 auto;
  padding: var(--space-8) var(--space-4);
}

.order-lookup__title {
  font-family: var(--font-display);
  font-size: var(--text-2xl);
  margin-bottom: var(--space-2);
}

.order-lookup__form {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  margin-top: var(--space-6);
}

.order-lookup__error {
  color: var(--color-error, #c0392b);
  font-size: var(--text-sm);
  padding: var(--space-3) var(--space-4);
  background: rgba(192, 57, 43, 0.08);
  border-radius: var(--radius-sm);
}

.order-lookup__empty {
  text-align: center;
  padding: var(--space-8) var(--space-4);
  color: var(--color-muted);
}
```

### Database Schema Reference (No Migration Needed)

Story 5.1 already created all required columns. The relevant schema for this story:

```sql
-- orders table (from 20260319000000_orders.sql)
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  violet_order_id TEXT NOT NULL UNIQUE,
  user_id UUID REFERENCES auth.users(id),       -- NULL for guest orders
  session_id TEXT,
  email TEXT NOT NULL,                            -- ← Used for email-based lookup
  status TEXT NOT NULL DEFAULT 'PROCESSING',
  subtotal INTEGER NOT NULL,
  shipping_total INTEGER NOT NULL DEFAULT 0,
  tax_total INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  order_lookup_token_hash TEXT,                   -- ← Used for token-based lookup
  email_sent BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes already exist:
CREATE INDEX idx_orders_email ON orders(email);
CREATE INDEX idx_orders_lookup_token ON orders(order_lookup_token_hash)
  WHERE order_lookup_token_hash IS NOT NULL;

-- RLS: NO anon/public SELECT policy — guest lookup uses service_role
-- Authenticated users have: users_read_own_orders (WHERE user_id = auth.uid())
-- Service role bypasses all RLS
```

### Token URL Format

From Story 5.1 confirmation page: the plaintext token URL is `/order/lookup?token=<base64url_token>`

Example: `/order/lookup?token=Xk9mN2pL8vR1qT3sU4wY5zA6bC7dE8fG9hI0jK1lM2nO3pQ4rS5tU6vW7xY8z`

The route `validateSearch` should accept this via:
```typescript
validateSearch: (search: Record<string, unknown>) => ({
  token: (search.token as string) || "",
})
```

### Previous Story Intelligence

- **Story 5.3 debug notes**: Handler/wrapper pattern for testability: pure handlers (e.g., `ordersHandler`) vs TanStack Start RPC wrappers (e.g., `getOrdersFn`). Apply same pattern to `lookupOrderByTokenFn` / `lookupOrdersByEmailFn` — export pure handlers for unit tests.
- **Story 5.3 code review fix**: `getSupabaseSessionClient()` now throws if `VITE_SUPABASE_URL` is missing — was silently falling back to localhost. This fix is already in place.
- **Story 5.3 code review fix (M3)**: `orderDetailHandler` filters by `.eq("user_id", user.id)` for defense-in-depth. For guest lookup, `user_id` is NULL — do NOT add this filter to guest handlers.
- **Story 5.1**: `guestToken.ts` is explicitly marked `// Server-only — do not import from client-side code`. Import via `@ecommerce/shared/src/utils/server` barrel (server-only re-exports).
- **Story 5.2 debug (D3)**: Pre-existing test failures in `violetCartAdapter.test.ts` — not related to this story. Pre-existing failure in `violetCartAdapter.test.ts`: body now includes `wallet_based_checkout:true`. Do not investigate these.
- **Mobile (Story 5.1 debug D1)**: `expo-clipboard` not installed — mobile fallback for token copy uses `Alert.alert()`. Same approach in lookup screen if copy functionality is needed.
- **Mobile (Story 5.1 debug D2)**: No `(tabs)` layout group in mobile — navigation uses `router.replace("/")` not `router.replace("/(tabs)")`.

### Git Intelligence

- Commit pattern: `feat: implement <description> (Story X.Y) + code review fixes`
- Latest: `2896f43 feat: implement unified order tracking view (Story 5.3) + code review fixes`
- Implementation sequence established: shared logic → server functions → routes/components → CSS → tests → fix-all
- Story 5.3 was pure web; Story 5.4 is web + mobile

### Edge Function (Task 6.5) Pattern Reference

Following `supabase/functions/handle-webhook/index.ts` pattern:

```typescript
// supabase/functions/guest-order-lookup/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const { type, token } = await req.json();
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  if (type === "token") {
    // Hash token server-side, query by hash
    const hash = await sha256Hex(token);
    const { data } = await supabase
      .from("orders")
      .select("*, order_bags(*, order_items(*))")
      .eq("order_lookup_token_hash", hash)
      .single();
    return Response.json({ data });
  }

  if (type === "email") {
    // Verify JWT from Authorization header, extract email
    const jwt = req.headers.get("Authorization")?.replace("Bearer ", "");
    const { data: { user } } = await supabase.auth.getUser(jwt);
    if (!user?.email) return Response.json({ error: "Not authenticated" }, { status: 401 });

    const { data } = await supabase
      .from("orders")
      .select("*, order_bags(*, order_items(*))")
      .eq("email", user.email)
      .order("created_at", { ascending: false });
    return Response.json({ data });
  }
});
```

### Project Structure Notes

- **No new database migration** — All required columns and indexes exist from Story 5.1 migration (`20260319000000_orders.sql`).
- **`/order/lookup` vs `/account/orders`** — Both display orders but serve different users: `/account/orders` requires auth + queries by `user_id`; `/order/lookup` is public + queries by token hash or email (via service_role after OTP).
- **Future: Link authenticated users to their guest orders** — Out of scope for this story. If a guest creates an account with the same email later, their `orders` rows still have `user_id = null`. Merging is a future enhancement.
- **Mobile: `/order/lookup` route** — The mobile file `apps/mobile/src/app/order/lookup.tsx` creates the route `/order/lookup` in expo-router. Access via `router.push("/order/lookup")` or `router.push("/order/lookup?token=xxx")`.

### References

- [Source: epics.md#Story 5.4 — Guest Order Lookup acceptance criteria]
- [Source: prd.md#FR27 — Buyers can look up order status by email without an account]
- [Source: prd.md#FR54 — GDPR data minimization: only collect what's needed for guest sessions]
- [Source: prd.md#NFR12 — Guest session data minimized and ephemeral]
- [Source: 5-1-order-confirmation-data-persistence.md — orders table schema, order_lookup_token_hash column, idx_orders_email index, idx_orders_lookup_token index, no anon RLS policy for guest lookup]
- [Source: 5-1-order-confirmation-data-persistence.md — guestToken.ts: generateOrderLookupToken() + hashOrderLookupToken(), server-only import path]
- [Source: 5-3-unified-order-tracking-view.md — OrderWithBagsAndItems type, getSupabaseServer() service role pattern, handler/wrapper testability pattern]
- [Source: apps/web/src/server/supabaseServer.ts — getSupabaseServer() (service role), getSupabaseSessionClient() (RLS-respecting)]
- [Source: apps/web/src/routes/auth/verify.tsx — Supabase OTP verify pattern, 6-digit code input, signInWithOtp flow]
- [Source: apps/web/src/routes/auth/login.tsx — auth form BEM CSS patterns (.auth-form, .auth-form__field, etc.)]
- [Source: CLAUDE.md — No Tailwind CSS, BEM convention, Vanilla CSS exclusively, double quotes, semicolons, 100 char width]
- [Source: architecture.md — Server Functions vs Edge Functions: if both platforms need it, use Edge Function; token lookup was designed for Edge Function access]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- D1: Story dev notes specified `@ecommerce/shared/src/utils/server` import path, but actual package.json exports this as `@ecommerce/shared/server/utils`. Fixed in both `guestOrders.ts` and test mock.
- D2: Mobile `fontWeight` TypeScript error — `typography.typeScale.h1.weight` is `number` type, incompatible with RN's string literal union. Used `as any` cast with eslint disable comment (established pattern in mobile auth screens).

### Code Review Fixes (AI Review)

- **[H1] AC #4 fix** — Added `isRateLimited` state to `lookup.tsx` (web); set to `true` on rate limit detection. Changed email submit button disabled condition from `isLoading || (!!error && !!token)` to `isLoading || isRateLimited`. The original condition only blocked re-submission when a `token` URL param was present, leaving the rate-limited path unguarded.
- **[M1] OTP session cleanup on failure (web)** — Wrapped `lookupOrdersByEmailFn()` + `setCurrentStep()` in a `try/finally` block so `supabase.auth.signOut()` is always called after OTP verification succeeds, even if the orders fetch throws.
- **[M2] OTP session cleanup on failure (mobile)** — Same `try/finally` pattern applied in `apps/mobile/src/app/order/lookup.tsx` `handleOtpSubmit`.
- **[M3] Edge Function res.ok checks (mobile)** — Added `if (!res.ok) throw new Error(...)` to `lookupByToken` and `lookupByEmail` in mobile lookup. `fetch` only rejects on network errors; 4xx/5xx responses must be checked manually.
- **[M4] Status labels deduplication (mobile)** — Removed local `ORDER_STATUS_LABELS` and `BAG_STATUS_LABELS` declarations from mobile lookup screen; now imported from `@ecommerce/shared` (already used in the same file for `formatPrice`/`formatDate`).
- **[M5] routeTree.gen.ts added to File List** — TanStack Router auto-generates this file when routes are added; now documented.

### Completion Notes List

- Implemented all 7 tasks covering web server functions, web route, CSS, mobile profile, mobile lookup screen, Edge Function, and unit tests
- Both lookup paths implemented: token-based (auto-lookup on mount via `lookupOrderByTokenFn`) and email-based (OTP flow via Supabase Auth)
- Edge Function `guest-order-lookup` serves both platforms using Web Crypto API (SHA-256) for token hashing in Deno runtime — avoids `node:crypto` dependency
- OTP session cleanup (`supabase.auth.signOut()`) implemented on both web and mobile immediately after fetching orders
- Import path correction: story noted `@ecommerce/shared/src/utils/server`, actual export is `@ecommerce/shared/server/utils` per package.json
- 12 unit tests covering token lookup (found/not found/error), email lookup (authenticated/no session/no email/DB error), all passing
- `bun run fix-all` passes with 0 errors, 0 warnings; `bun --cwd=apps/web run test` 175/175 tests pass

### File List

- `apps/web/src/server/guestOrders.ts` (created)
- `apps/web/src/routes/order/lookup.tsx` (created)
- `apps/web/src/styles/pages/lookup.css` (created)
- `apps/web/src/styles/index.css` (modified — added lookup.css import)
- `apps/mobile/src/app/profile.tsx` (modified — added Order Tracking section)
- `apps/mobile/src/app/order/lookup.tsx` (created)
- `supabase/functions/guest-order-lookup/index.ts` (created)
- `apps/web/src/server/__tests__/guestOrders.test.ts` (created)
- `apps/web/src/routeTree.gen.ts` (modified — auto-generated by TanStack Router when new route added)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (modified — status: review)
